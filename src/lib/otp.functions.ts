/**
 * OTP + verification workflow for storefront orders.
 *
 * submitPendingOrder — public: creates a WooCommerce order (status=pending),
 *   stashes the tracking snapshot in Woo meta (_zonash_tracking), generates a
 *   4-digit OTP, saves the hash in `order_otps`, and texts the code via
 *   BDBulkSMS. Never authenticated — the customer is a guest.
 *
 * verifyOrderOtp — public: validates the code, then runs (a) Hoorin rating
 *   check (b) duplicate-order detection across pending/confirmed/processing/
 *   on-hold using phone / device fingerprint / IP. Sets Woo to `confirmed`
 *   on success, `on-hold` when review is needed. All decisions are stored in
 *   order meta so admins can audit them later.
 *
 * resendOrderOtp — public: rate-limited (60s / max 5 resends).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------- helpers ----------

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateOtp(): string {
  // Uniform 4-digit via crypto
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1000 + (arr[0] % 9000));
}

function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (digits.length === 13 && digits.startsWith("880")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("01")) return digits;
  return digits.slice(-11);
}

async function readClientContext() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip =
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return {
    ip,
    country: getRequestHeader("cf-ipcountry") || null,
    user_agent: getRequestHeader("user-agent") || null,
    accept_language: getRequestHeader("accept-language") || null,
  };
}

// ---------- schemas ----------

const trackingSchema = z.record(z.string(), z.unknown()).optional();

const submitSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        variation_id: z.number().int().positive().optional(),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .min(1)
    .max(50),
  billing: z.object({
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().max(60).default(""),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .default("")
      .refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Invalid email"),
    phone: z.string().trim().min(8).max(30),
    address_1: z.string().trim().min(1).max(300),
    address_2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1).max(80),
    country: z.string().trim().length(2).default("BD"),
  }),
  // Client-provided pricing is accepted for backwards compatibility but
  // completely ignored — subtotal, shipping, and discount are recomputed
  // on the server below. Kept in the schema only so old clients don't 400.
  shipping_amount: z.number().min(0).max(100_000).default(0).optional(),
  shipping_label: z.string().max(120).default("Delivery").optional(),
  coupon_code: z.string().trim().max(50).optional(),
  discount: z.number().min(0).max(1_000_000).default(0).optional(),
  customer_note: z.string().max(1000).optional().default(""),
  tracking: trackingSchema,
  // Client-generated idempotency key. Stable across retries of the same
  // logical submission; regenerated after a successful order. Server also
  // derives a fallback key from phone+items+fingerprint if omitted.
  idempotency_key: z.string().trim().min(8).max(128).optional(),
});

// ---------- idempotency (short-TTL, in-worker dedup) ----------

type SubmitResult =
  | { ok: true; order_id: number; order_number: string; total: string; phone_masked: string; sms_ok: boolean }
  | { ok: false; error: string };

const IDEMP_TTL_MS = 10 * 60_000; // 10 minutes
const IDEMP_MAX = 5000;
const idempStore = new Map<string, { expiresAt: number; promise: Promise<SubmitResult> }>();

function idempSweep() {
  const now = Date.now();
  for (const [k, v] of idempStore) if (v.expiresAt <= now) idempStore.delete(k);
  if (idempStore.size > IDEMP_MAX) {
    // Drop oldest ~10% when overloaded.
    const drop = Math.ceil(IDEMP_MAX * 0.1);
    let i = 0;
    for (const k of idempStore.keys()) {
      idempStore.delete(k);
      if (++i >= drop) break;
    }
  }
}

async function deriveIdempotencyKey(
  provided: string | undefined,
  phone: string,
  items: { product_id: number; variation_id?: number; quantity: number }[],
  fingerprint: string,
): Promise<string> {
  if (provided && provided.length >= 8) return `c:${provided}`;
  const norm = items
    .map((i) => `${i.product_id}:${i.variation_id ?? 0}:${i.quantity}`)
    .sort()
    .join("|");
  return `d:${await sha256Hex(`${phone}::${norm}::${fingerprint}`)}`;
}

// Server-side coupon table (source of truth). Keep in sync with UI copy in
// src/routes/checkout.tsx; if it drifts, this authoritative version wins.
// `max_uses` = global cap; `max_per_phone` = per-customer cap. Omit either
// (or set to null) to skip that limit.
type CouponRule = {
  type: "percent" | "flat";
  value: number;
  max_uses?: number | null;
  max_per_phone?: number | null;
};
const SERVER_COUPONS: Record<string, CouponRule> = {
  ZONASH10: { type: "percent", value: 10, max_uses: 1000, max_per_phone: 3 },
  SAVE50:   { type: "flat",    value: 50, max_uses: 500,  max_per_phone: 1 },
};

// SMS cost cap per phone per rolling 24h. Prevents runaway BDBulkSMS bills
// from a customer (or bot) that keeps re-triggering OTP sends.
const SMS_MAX_PER_PHONE_24H = 10;


// Shipping rule (source of truth): 80 BDT inside Dhaka City, 130 BDT elsewhere.
const SHIP_INSIDE_DHAKA = 80;
const SHIP_OUTSIDE_DHAKA = 130;

/** Fetch each product once, in parallel, and compute a trustworthy subtotal. */
async function computeServerSubtotal(
  items: { product_id: number; variation_id?: number; quantity: number }[],
): Promise<number> {
  const { wooFetch } = await import("./woo.server");
  const prices = await Promise.all(
    items.map(async (i) => {
      try {
        if (i.variation_id) {
          const v = await wooFetch<{ price: string }>({
            path: `/products/${i.product_id}/variations/${i.variation_id}`,
            timeoutMs: 8000,
          });
          return Number(v.price) || 0;
        }
        const p = await wooFetch<{ price: string }>({
          path: `/products/${i.product_id}`,
          timeoutMs: 8000,
        });
        return Number(p.price) || 0;
      } catch {
        return 0;
      }
    }),
  );
  return items.reduce((sum, i, idx) => sum + prices[idx] * i.quantity, 0);
}

/** Server-authoritative shipping: matches thana against `police_stations` and
 *  returns 80 BDT inside Dhaka City, 130 BDT elsewhere. Falls back to the
 *  higher rate when the thana is unknown so we never under-charge. */
async function computeServerShipping(thana: string): Promise<{ amount: number; label: string; insideDhaka: boolean }> {
  const t = (thana || "").trim();
  if (!t) return { amount: SHIP_OUTSIDE_DHAKA, label: "Delivery (Outside Dhaka)", insideDhaka: false };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("police_stations" as never)
      .select("is_dhaka_city")
      .ilike("name", t)
      .limit(1)
      .maybeSingle();
    const inside = !!(data as { is_dhaka_city?: boolean } | null)?.is_dhaka_city;
    return inside
      ? { amount: SHIP_INSIDE_DHAKA, label: "Delivery (Inside Dhaka)", insideDhaka: true }
      : { amount: SHIP_OUTSIDE_DHAKA, label: "Delivery (Outside Dhaka)", insideDhaka: false };
  } catch {
    return { amount: SHIP_OUTSIDE_DHAKA, label: "Delivery (Outside Dhaka)", insideDhaka: false };
  }
}

/**
 * Resolve a coupon against caps. Returns discount=0 (and reason) when the
 * global `max_uses` or per-phone `max_per_phone` cap is already reached.
 * Counting is done against `coupon_usage`, which we insert into after every
 * successful order — so this reflects actual redemptions, not just Woo state.
 */
async function resolveCouponDiscount(
  code: string | undefined,
  subtotal: number,
  phone: string,
): Promise<{ code: string | null; discount: number; reason?: string }> {
  if (!code) return { code: null, discount: 0 };
  const key = code.trim().toUpperCase();
  const c = SERVER_COUPONS[key];
  if (!c || subtotal <= 0) return { code: null, discount: 0, reason: "invalid" };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (c.max_uses != null) {
      const { count } = await supabaseAdmin
        .from("coupon_usage" as never)
        .select("id", { head: true, count: "exact" })
        .eq("coupon_code", key);
      if ((count ?? 0) >= c.max_uses) {
        return { code: null, discount: 0, reason: "max_uses_reached" };
      }
    }
    if (c.max_per_phone != null && phone) {
      const { count } = await supabaseAdmin
        .from("coupon_usage" as never)
        .select("id", { head: true, count: "exact" })
        .eq("coupon_code", key)
        .eq("phone", phone);
      if ((count ?? 0) >= c.max_per_phone) {
        return { code: null, discount: 0, reason: "max_per_phone_reached" };
      }
    }
  } catch (e) {
    // Fail-closed on caps: if we can't verify, don't grant the discount.
    console.error("resolveCouponDiscount cap check failed:", (e as Error).message);
    return { code: null, discount: 0, reason: "cap_check_failed" };
  }

  const raw = c.type === "percent" ? Math.round((subtotal * c.value) / 100) : c.value;
  return { code: key, discount: Math.max(0, Math.min(raw, subtotal)) };
}

/**
 * Count how many OTP SMS have been sent to this phone in the last 24h,
 * by summing `send_count` across all `order_otps` rows whose most recent
 * send falls in the window. Fail-open (0) on DB errors so infra issues
 * don't block real customers.
 */
async function smsSendsLast24h(phone: string): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("order_otps" as never)
      .select("send_count")
      .eq("phone", phone)
      .gte("last_sent_at", since);
    if (error) return 0;
    return ((data ?? []) as { send_count: number }[]).reduce(
      (s, r) => s + (r.send_count || 0),
      0,
    );
  } catch {
    return 0;
  }
}




// ---------- submitPendingOrder ----------

export const submitPendingOrder = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => submitSchema.parse(raw))
  .handler(async ({ data }): Promise<SubmitResult> => {
    const phone = normalizePhone(data.billing.phone);
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      return { ok: false, error: "Invalid Bangladeshi mobile number." };
    }

    // Idempotency: dedupe concurrent/near-duplicate submissions within a
    // short TTL so a double-click, network retry, or fast re-POST returns
    // the same order instead of creating a second Woo order.
    idempSweep();
    const fingerprint =
      (data.tracking as { fingerprint?: string } | undefined)?.fingerprint ?? "";
    const idempKey = await deriveIdempotencyKey(
      data.idempotency_key,
      phone,
      data.items,
      fingerprint,
    );
    const existing = idempStore.get(idempKey);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.promise;
    }

    const run = async (): Promise<SubmitResult> => {

    const server = await readClientContext();
    const trackingBundle = {
      client: data.tracking ?? {},
      server: { ...server, at: new Date().toISOString() },
    };
    const clientFingerprint =
      (data.tracking as { fingerprint?: string } | undefined)?.fingerprint ?? "";

    // Rate limit + bot-signal assessment. Fail-open on DB errors.
    const { assessOrderSubmit, recordOrderSubmit } = await import("./abuse.server");
    const assessment = await assessOrderSubmit({
      ip: server.ip ?? "",
      fingerprint: clientFingerprint,
      phone,
    });
    if (assessment.blocked) {
      // Silent rate-limit: log the attempt so admins can see the pattern,
      // return a generic error that gives no signal to a bot.
      void recordOrderSubmit({
        ip: server.ip ?? "",
        fingerprint: clientFingerprint,
        phone,
        meta: { blocked: true, score: assessment.score, signals: assessment.signals },
      });
      return {
        ok: false as const,
        error: "We couldn't place your order right now. Please try again in a few minutes.",
      };
    }


    // Server-side coupon validation: recompute subtotal from Woo prices and
    // resolve the discount against our own coupon table. Any tampered
    // `data.discount` or unknown `data.coupon_code` is discarded here.
    const serverSubtotal = await computeServerSubtotal(data.items);
    const { code: validCoupon, discount: validDiscount } = await resolveCouponDiscount(
      data.coupon_code,
      serverSubtotal,
      phone,
    );

    const serverShipping = await computeServerShipping(data.billing.city);
    const serverGrandTotal = Math.max(0, serverSubtotal - validDiscount) + serverShipping.amount;


    // 1) Create the WooCommerce order in `pending` state.
    const feeLines =
      validDiscount > 0
        ? [{ name: "Discount", total: (-Math.abs(validDiscount)).toFixed(2) }]
        : [];

    // WooCommerce rejects empty-string emails with rest_invalid_email.
    // Only include the email key when the customer actually provided one.
    const billingPayload: Record<string, unknown> = {
      first_name: data.billing.first_name,
      last_name: data.billing.last_name,
      phone,
      address_1: data.billing.address_1,
      address_2: data.billing.address_2,
      city: data.billing.city,
      country: data.billing.country,
    };
    if (data.billing.email && data.billing.email.trim()) {
      billingPayload.email = data.billing.email.trim();
    }

    let created: { id: number; number: string; total: string; currency: string };
    try {
      const { wooFetch } = await import("./woo.server");
      created = await wooFetch<{ id: number; number: string; total: string; currency: string }>({
        path: "/orders",
        method: "POST",
        body: {
          status: "pending",
          payment_method: "cod",
          payment_method_title: "Cash on Delivery",
          set_paid: false,
          billing: billingPayload,
          shipping: {
            first_name: data.billing.first_name,
            last_name: data.billing.last_name,
            address_1: data.billing.address_1,
            address_2: data.billing.address_2,
            city: data.billing.city,
            country: data.billing.country,
            phone,
          },
          line_items: data.items,
          shipping_lines: [
            {
              method_id: "flat_rate",
              method_title: serverShipping.label,
              total: serverShipping.amount.toFixed(2),
            },
          ],
          fee_lines: feeLines,
          customer_note: data.customer_note,
          meta_data: [
            { key: "_zonash_tracking", value: JSON.stringify(trackingBundle) },
            { key: "_zonash_fingerprint", value: clientFingerprint },
            { key: "_zonash_ip", value: server.ip ?? "" },
            { key: "_zonash_ua", value: server.user_agent ?? "" },
            { key: "_zonash_otp_state", value: "pending" },
            { key: "_zonash_channel", value: "storefront" },
            { key: "_zonash_coupon", value: validCoupon ?? "" },
            { key: "_zonash_coupon_discount", value: String(validDiscount) },
            { key: "_zonash_server_subtotal", value: serverSubtotal.toFixed(2) },
            { key: "_zonash_server_shipping", value: serverShipping.amount.toFixed(2) },
            { key: "_zonash_server_total", value: serverGrandTotal.toFixed(2) },
            { key: "_zonash_inside_dhaka", value: serverShipping.insideDhaka ? "1" : "0" },
            { key: "_zonash_risk_score", value: String(assessment.score) },
            { key: "_zonash_risk_signals", value: assessment.signals.join(",") },
            { key: "_zonash_velocity", value: JSON.stringify(assessment.counts) },
          ],


        },
        timeoutMs: 15000,
      });
    } catch (e) {
      console.error("submitPendingOrder: Woo create failed", e);
      return {
        ok: false as const,
        error: "Could not create your order right now. Please try again.",
      };
    }

    // Log successful submit for future velocity checks (fire-and-forget).
    void recordOrderSubmit({
      ip: server.ip ?? "",
      fingerprint: clientFingerprint,
      phone,
      meta: { order_id: created.id, score: assessment.score, signals: assessment.signals },
    });



    // 2) Persist OTP in Supabase.
    const code = generateOtp();
    const codeHash = await sha256Hex(`${code}:${phone}`);
    const phoneHash = await sha256Hex(phone);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("order_otps" as never).upsert(
        {
          wc_order_id: created.id,
          phone,
          phone_hash: phoneHash,
          code_hash: codeHash,
          attempts: 0,
          max_attempts: 5,
          expires_at: expiresAt,
          last_sent_at: new Date().toISOString(),
          send_count: 1,
          tracking: trackingBundle,
          ip_address: server.ip,
        } as never,
        { onConflict: "wc_order_id" },
      );
      if (error) console.error("order_otps upsert error", error);
    } catch (e) {
      console.error("order_otps write failed", e);
      // Non-fatal: order exists in Woo, admins can still process manually.
    }

    // 3) Send SMS (fail-open — don't block customer, they can resend).
    //    Enforce a per-phone 24h SMS cap first to protect BDBulkSMS spend.
    let smsOk = false;
    const smsSentSoFar = await smsSendsLast24h(phone);
    if (smsSentSoFar >= SMS_MAX_PER_PHONE_24H) {
      console.warn(`OTP SMS capped for ${phone}: ${smsSentSoFar}/${SMS_MAX_PER_PHONE_24H} in 24h`);
    } else {
      try {
        const { sendSms } = await import("./sms.server");
        const res = await sendSms({
          phone,
          message: `<#> Zonash: ${code} is your order #${created.number} code. Valid 5 min.\n\n@zonash.lovable.app #${code}`,
        });
        smsOk = res.ok;
        if (!smsOk) console.error("OTP SMS failed", res.message);
      } catch (e) {
        console.error("OTP SMS threw", e);
      }
    }

    // 4) Record coupon redemption (best-effort) — enforces max_uses /
    //    max_per_phone on subsequent attempts. Unique (coupon_code, wc_order_id)
    //    makes this idempotent under retry.
    if (validCoupon && validDiscount > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("coupon_usage" as never).insert({
          coupon_code: validCoupon,
          phone,
          wc_order_id: created.id,
          discount: validDiscount,
        } as never);
      } catch (e) {
        console.error("coupon_usage insert failed:", (e as Error).message);
      }
    }



    return {
      ok: true,
      order_id: created.id,
      order_number: created.number,
      total: created.total,
      phone_masked: `${phone.slice(0, 3)}****${phone.slice(-2)}`,
      sms_ok: smsOk,
    };
    };

    const promise = run();
    idempStore.set(idempKey, { promise, expiresAt: Date.now() + IDEMP_TTL_MS });
    try {
      const result = await promise;
      // Only cache successful order creations. Failures (validation, Woo
      // outage) should not block a genuine retry.
      if (!result.ok) idempStore.delete(idempKey);
      return result;
    } catch (err) {
      idempStore.delete(idempKey);
      throw err;
    }
  });

// ---------- resendOrderOtp ----------

export const resendOrderOtp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ order_id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("order_otps" as never)
      .select("*")
      .eq("wc_order_id", data.order_id)
      .maybeSingle();
    if (error || !row) return { ok: false as const, error: "Order not found." };
    const r = row as {
      phone: string;
      verified_at: string | null;
      last_sent_at: string;
      send_count: number;
    };
    if (r.verified_at) return { ok: false as const, error: "Already verified." };
    if (Date.now() - new Date(r.last_sent_at).getTime() < 60_000) {
      return { ok: false as const, error: "Please wait a minute before requesting another code." };
    }
    if (r.send_count >= 5) {
      return { ok: false as const, error: "Too many code requests. Please contact support." };
    }
    // Per-phone 24h SMS cost cap.
    if ((await smsSendsLast24h(r.phone)) >= SMS_MAX_PER_PHONE_24H) {
      return { ok: false as const, error: "Daily code limit reached. Please try again tomorrow." };
    }


    const code = generateOtp();
    const codeHash = await sha256Hex(`${code}:${r.phone}`);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

    await supabaseAdmin
      .from("order_otps" as never)
      .update({
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
        last_sent_at: new Date().toISOString(),
        send_count: r.send_count + 1,
      } as never)
      .eq("wc_order_id", data.order_id);

    let smsOk = false;
    try {
      const { sendSms } = await import("./sms.server");
      const res = await sendSms({
        phone: r.phone,
        message: `<#> Zonash: ${code} is your order #${data.order_id} code. Valid 5 min.\n\n@zonash.lovable.app #${code}`,
      });
      smsOk = res.ok;
    } catch (e) {
      console.error("resendOrderOtp SMS threw", e);
    }
    return { ok: true as const, sms_ok: smsOk };
  });

// ---------- verifyOrderOtp ----------

type WooLite = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  billing?: { phone?: string; email?: string; address_1?: string };
  meta_data?: { key: string; value: unknown }[];
};

export type Duplicate = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  match: string[];
};

export const verifyOrderOtp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        order_id: z.number().int().positive(),
        code: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit code"),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rowRaw } = await supabaseAdmin
      .from("order_otps" as never)
      .select("*")
      .eq("wc_order_id", data.order_id)
      .maybeSingle();
    if (!rowRaw) return { ok: false as const, error: "Order not found." };
    const row = rowRaw as {
      phone: string;
      code_hash: string;
      attempts: number;
      max_attempts: number;
      expires_at: string;
      verified_at: string | null;
      ip_address: string | null;
      tracking: unknown;
      decision: string | null;
      decision_reason: string | null;
    };

    if (row.verified_at) {
      return {
        ok: true as const,
        already: true,
        decision: (row.decision as "confirmed" | "review") ?? "confirmed",
        reason: row.decision_reason ?? "",
        duplicates: [] as Duplicate[],
      };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, error: "Code expired. Please request a new one." };
    }
    if (row.attempts >= row.max_attempts) {
      return { ok: false as const, error: "Too many wrong attempts. Please request a new code." };
    }

    const codeHash = await sha256Hex(`${data.code}:${row.phone}`);
    if (codeHash !== row.code_hash) {
      await supabaseAdmin
        .from("order_otps" as never)
        .update({ attempts: row.attempts + 1 } as never)
        .eq("wc_order_id", data.order_id);
      return { ok: false as const, error: "Incorrect code. Please try again." };
    }

    // ===== OTP is correct. Run rating + duplicate detection. =====
    const { wooFetch } = await import("./woo.server");
    const clientFp =
      (row.tracking as { client?: { fingerprint?: string } } | null)?.client?.fingerprint ?? "";

    // Hoorin rating (fail-open).
    let hoorinReport: unknown = null;
    let ratingBlock = false;
    let ratingReason = "";
    try {
      const { hoorinSearch, hoorinConfigured } = await import("./hoorin.server");
      if (hoorinConfigured()) {
        const rep = await hoorinSearch(row.phone, { cache: "on", timeoutMs: 10_000 });
        hoorinReport = rep;
        const total = rep.overall?.total_parcels ?? 0;
        const ratio = rep.overall?.success_ratio ?? 0; // 0-100
        let allow = true;
        if (total < 3) allow = true;
        else if (total <= 5) allow = ratio >= 50;
        else if (total <= 10) allow = ratio >= 60;
        else allow = ratio >= 70;
        if (!allow) {
          ratingBlock = true;
          ratingReason = `Courier rating ${ratio.toFixed(0)}% over ${total} parcels below threshold`;
        }
      } else {
        ratingReason = "Rating unavailable (Hoorin not configured)";
      }
    } catch (e) {
      console.error("Hoorin lookup failed — failing open", e);
      ratingReason = "Rating provider unreachable — allowed";
    }

    // Duplicate detection across active statuses.
    const duplicates: Duplicate[] = [];
    try {
      const statuses = ["pending", "on-hold", "processing", "confirmed"].join(",");
      const orders = await wooFetch<WooLite[]>({
        path: "/orders",
        query: {
          search: row.phone,
          per_page: 30,
          status: statuses,
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 12_000,
      });
      const tail = row.phone.slice(-10);
      for (const o of orders) {
        if (o.id === data.order_id) continue;
        const otherPhone = (o.billing?.phone ?? "").replace(/\D/g, "");
        const meta = Object.fromEntries((o.meta_data ?? []).map((m) => [m.key, m.value]));
        const otherFp = String(meta["_zonash_fingerprint"] ?? "");
        const otherIp = String(meta["_zonash_ip"] ?? "");
        const match: string[] = [];
        if (otherPhone.endsWith(tail)) match.push("phone");
        if (clientFp && otherFp && otherFp === clientFp) match.push("device");
        if (row.ip_address && otherIp && otherIp === row.ip_address) match.push("ip");
        // Phone or device alone = strong signal; IP alone is discarded (NAT).
        const strong = match.includes("phone") || match.includes("device");
        if (strong) {
          duplicates.push({
            id: o.id,
            number: o.number,
            status: o.status,
            date_created: o.date_created,
            total: o.total,
            match,
          });
        }
      }
    } catch (e) {
      console.error("duplicate check failed — continuing", e);
    }

    let decision: "confirmed" | "review" = "confirmed";
    let decisionReason = "";
    if (ratingBlock) {
      decision = "review";
      decisionReason = ratingReason;
    } else if (duplicates.length > 0) {
      decision = "review";
      decisionReason = `Duplicate signals against ${duplicates.length} active order(s): ${duplicates
        .map((d) => `#${d.number} (${d.match.join("+")})`)
        .join(", ")}`;
    }

    // Persist decision meta on Woo. Status change is deferred:
    //   - review    → apply on-hold now (with fallback).
    //   - confirmed → KEEP order as `pending` until the customer chooses
    //                 whether they want a confirmation call. That final step
    //                 happens in `finalizeOrderChoice` below.
    const wantedStatus = decision === "confirmed" ? "pending" : "on-hold";
    let appliedStatus = wantedStatus;
    try {
      await wooFetch({
        path: `/orders/${data.order_id}`,
        method: "PUT",
        body: {
          status: wantedStatus,
          meta_data: [
            { key: "_zonash_otp_state", value: "verified" },
            { key: "_zonash_otp_verified_at", value: new Date().toISOString() },
            { key: "_zonash_decision", value: decision },
            { key: "_zonash_decision_reason", value: decisionReason },
            { key: "_zonash_hoorin_report", value: JSON.stringify(hoorinReport ?? {}) },
            { key: "_zonash_duplicates", value: JSON.stringify(duplicates) },
            { key: "_zonash_awaiting_call_choice", value: decision === "confirmed" ? "1" : "0" },
          ],
        },
        timeoutMs: 12_000,
      });
    } catch (e) {
      console.error(`Woo PUT ${wantedStatus} failed — falling back`, e);
      appliedStatus = decision === "confirmed" ? "pending" : "on-hold";
    }

    // Private note audit trail.
    try {
      await wooFetch({
        path: `/orders/${data.order_id}/notes`,
        method: "POST",
        body: {
          note:
            `✅ OTP verified. Decision: ${decision.toUpperCase()} (status → ${appliedStatus}).\n` +
            (decisionReason ? `Reason: ${decisionReason}\n` : "") +
            (duplicates.length
              ? `Duplicates: ${duplicates.map((d) => `#${d.number} [${d.match.join(",")}]`).join(", ")}`
              : ""),
          customer_note: false,
        },
      });
    } catch {
      /* ignore */
    }

    await supabaseAdmin
      .from("order_otps" as never)
      .update({
        verified_at: new Date().toISOString(),
        decision,
        decision_reason: decisionReason,
      } as never)
      .eq("wc_order_id", data.order_id);

    return {
      ok: true as const,
      decision,
      reason: decisionReason,
      duplicates,
    };
  });

// ---------- finalizeOrderChoice ----------
//
// Final step of the storefront verification funnel. Called from the
// "Do you need a confirmation call?" page after OTP verification succeeded
// with decision=confirmed. If the customer wants a call we keep the order
// pending (with a private note for the ops team). If they don't, we flip
// to `confirmed` (fallback → `processing` when Woo doesn't know the custom
// status).

export const finalizeOrderChoice = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        order_id: z.number().int().positive(),
        wants_call: z.boolean(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rowRaw } = await supabaseAdmin
      .from("order_otps" as never)
      .select("*")
      .eq("wc_order_id", data.order_id)
      .maybeSingle();
    if (!rowRaw) return { ok: false as const, error: "Order not found." };
    const row = rowRaw as {
      verified_at: string | null;
      decision: string | null;
    };
    if (!row.verified_at) {
      return { ok: false as const, error: "This order has not been verified yet." };
    }
    if (row.decision && row.decision !== "confirmed") {
      return { ok: false as const, error: "This order is under manual review." };
    }

    const { wooFetch } = await import("./woo.server");
    const nowIso = new Date().toISOString();

    if (data.wants_call) {
      // Keep pending; annotate.
      try {
        await wooFetch({
          path: `/orders/${data.order_id}`,
          method: "PUT",
          body: {
            status: "pending",
            meta_data: [
              { key: "_zonash_awaiting_call_choice", value: "0" },
              { key: "_zonash_call_requested", value: "1" },
              { key: "_zonash_call_requested_at", value: nowIso },
            ],
          },
          timeoutMs: 12_000,
        });
      } catch (e) {
        console.error("finalizeOrderChoice(pending) failed", e);
      }
      try {
        await wooFetch({
          path: `/orders/${data.order_id}/notes`,
          method: "POST",
          body: {
            note: "📞 Customer requested a confirmation call. Order kept as pending — please call to confirm before dispatch.",
            customer_note: false,
          },
        });
      } catch {
        /* ignore */
      }
      return { ok: true as const, decision: "pending" as const };
    }

    // No call needed → confirm.
    let applied: "confirmed" | "processing" = "confirmed";
    try {
      await wooFetch({
        path: `/orders/${data.order_id}`,
        method: "PUT",
        body: {
          status: "confirmed",
          meta_data: [
            { key: "_zonash_awaiting_call_choice", value: "0" },
            { key: "_zonash_call_requested", value: "0" },
            { key: "_zonash_confirmed_at", value: nowIso },
          ],
        },
        timeoutMs: 12_000,
      });
    } catch (e) {
      console.error("finalizeOrderChoice(confirmed) failed — falling back to processing", e);
      applied = "processing";
      try {
        await wooFetch({
          path: `/orders/${data.order_id}`,
          method: "PUT",
          body: {
            status: "processing",
            meta_data: [
              { key: "_zonash_awaiting_call_choice", value: "0" },
              { key: "_zonash_call_requested", value: "0" },
              { key: "_zonash_confirmed_at", value: nowIso },
              { key: "_zonash_status_fallback", value: "confirmed->processing" },
            ],
          },
          timeoutMs: 12_000,
        });
      } catch (e2) {
        console.error("finalizeOrderChoice fallback also failed", e2);
      }
    }
    try {
      await wooFetch({
        path: `/orders/${data.order_id}/notes`,
        method: "POST",
        body: {
          note: `✅ Customer confirmed via storefront — no call requested. Status → ${applied}.`,
          customer_note: false,
        },
      });
    } catch {
      /* ignore */
    }
    return { ok: true as const, decision: "confirmed" as const, applied };
  });
