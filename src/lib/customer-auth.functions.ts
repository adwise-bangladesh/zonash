/**
 * Storefront customer authentication (phone + OTP).
 *
 * These are public server functions — anyone on the internet can call them.
 * Rate-limit via `last_sent_at` / `send_count` and cap OTP attempts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateOtp(): string {
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
const isBdMobile = (p: string) => /^01[3-9]\d{8}$/.test(p);

// -------------------- Request login OTP --------------------

export const requestCustomerLoginOtp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ phone: z.string().trim().min(6).max(20) }).parse(raw),
  )
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    if (!isBdMobile(phone)) {
      return { ok: false as const, error: "Please enter a valid 11-digit mobile number." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("customer_login_otps" as never)
      .select("last_sent_at, send_count")
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      const row = existing as { last_sent_at: string; send_count: number };
      if (Date.now() - new Date(row.last_sent_at).getTime() < 60_000) {
        return {
          ok: false as const,
          error: "Please wait a minute before requesting another code.",
        };
      }
      if (row.send_count >= 8) {
        return {
          ok: false as const,
          error: "Too many code requests today. Try again later.",
        };
      }
    }

    const code = generateOtp();
    const codeHash = await sha256Hex(`${code}:${phone}`);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

    await supabaseAdmin.from("customer_login_otps" as never).upsert(
      {
        phone,
        code_hash: codeHash,
        attempts: 0,
        max_attempts: 5,
        expires_at: expiresAt,
        last_sent_at: new Date().toISOString(),
        send_count: existing
          ? ((existing as { send_count: number }).send_count ?? 0) + 1
          : 1,
      } as never,
      { onConflict: "phone" },
    );

    let smsOk = false;
    try {
      const { sendSms } = await import("./sms.server");
      const res = await sendSms({
        phone,
        message: `<#> Zonash: ${code} is your sign-in code. Valid 5 min.\n\n@zonash.lovable.app #${code}`,
      });
      smsOk = res.ok;
      if (!smsOk) console.error("customer login OTP SMS failed", res.message);
    } catch (e) {
      console.error("customer login OTP SMS threw", e);
    }

    return {
      ok: true as const,
      sms_ok: smsOk,
      phone_masked: `${phone.slice(0, 3)}****${phone.slice(-2)}`,
    };
  });

// -------------------- Verify login OTP --------------------

export const verifyCustomerLoginOtp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        phone: z.string().trim().min(6).max(20),
        code: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit code"),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    if (!isBdMobile(phone)) {
      return { ok: false as const, error: "Invalid phone number." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rowRaw } = await supabaseAdmin
      .from("customer_login_otps" as never)
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    if (!rowRaw) return { ok: false as const, error: "No code found. Request a new one." };
    const row = rowRaw as {
      code_hash: string;
      attempts: number;
      max_attempts: number;
      expires_at: string;
    };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, error: "Code expired. Please request a new one." };
    }
    if (row.attempts >= row.max_attempts) {
      return { ok: false as const, error: "Too many wrong attempts. Request a new code." };
    }
    const hash = await sha256Hex(`${data.code}:${phone}`);
    if (hash !== row.code_hash) {
      await supabaseAdmin
        .from("customer_login_otps" as never)
        .update({ attempts: row.attempts + 1 } as never)
        .eq("phone", phone);
      return { ok: false as const, error: "Incorrect code. Please try again." };
    }

    // Consume the OTP so it can't be reused.
    await supabaseAdmin
      .from("customer_login_otps" as never)
      .delete()
      .eq("phone", phone);

    // Bind the verified phone to an httpOnly, HMAC-signed cookie so later
    // reads never have to trust a client-supplied phone number.
    const { issueCustomerSession } = await import("./customer-token.server");
    await issueCustomerSession(phone);

    return { ok: true as const, phone };
  });

/** Drops the signed session cookie (httpOnly — the client can't clear it). */
export const endCustomerSession = createServerFn({ method: "POST" }).handler(async () => {
  const { clearCustomerSession } = await import("./customer-token.server");
  clearCustomerSession();
  return { ok: true as const };
});


// -------------------- Public: list orders for a phone --------------------

type WooLineItem = {
  id?: number;
  name: string;
  quantity: number;
  sku?: string;
  price?: number | string;
  subtotal?: string;
  total?: string;
  image?: { src?: string };
  meta_data?: { key?: string; display_key?: string; display_value?: string }[];
};

type WooOrderLite = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  date_modified?: string | null;
  date_paid?: string | null;
  date_completed?: string | null;
  total: string;
  shipping_total?: string;
  discount_total?: string;
  currency: string;
  payment_method?: string;
  payment_method_title?: string;
  customer_note?: string;
  line_items?: WooLineItem[];
  shipping_lines?: { method_title?: string; total?: string }[];
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
  };
  shipping?: {
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
  };
  /** Real per-status timestamps from our own audit log (Woo stores none). */
  status_events?: Record<string, string>;
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0";
};

/** Keep only the fields the customer UI renders — Woo order payloads are huge. */
function trimOrder(o: WooOrderLite): WooOrderLite {
  return {
    id: Number(o.id) || 0,
    number: str(o.number) || String(o.id ?? ""),
    status: str(o.status) || "pending",
    date_created: str(o.date_created),
    date_modified: o.date_modified ?? null,
    date_paid: o.date_paid ?? null,
    date_completed: o.date_completed ?? null,
    total: money(o.total),
    shipping_total: money(o.shipping_total),
    discount_total: money(o.discount_total),
    currency: str(o.currency) || "BDT",
    payment_method_title: str(o.payment_method_title) || undefined,
    customer_note: str(o.customer_note) || undefined,
    line_items: (Array.isArray(o.line_items) ? o.line_items : []).map((li) => ({
      id: li?.id,
      name: str(li?.name) || "Item",
      quantity: Number(li?.quantity) > 0 ? Number(li.quantity) : 1,
      sku: str(li?.sku) || undefined,
      subtotal: money(li?.subtotal),
      total: money(li?.total),
      image: li?.image?.src ? { src: str(li.image.src) } : undefined,
      meta_data: (Array.isArray(li?.meta_data) ? li.meta_data : [])
        .filter((md) => md?.display_key && md?.display_value)
        .slice(0, 6)
        .map((md) => ({
          display_key: str(md.display_key),
          display_value: str(md.display_value),
        })),
    })),
    shipping_lines: (Array.isArray(o.shipping_lines) ? o.shipping_lines : [])
      .slice(0, 1)
      .map((sl) => ({ method_title: str(sl?.method_title) || undefined })),
    billing: {
      first_name: str(o.billing?.first_name),
      email: str(o.billing?.email),
      last_name: str(o.billing?.last_name),
      phone: str(o.billing?.phone),
      address_1: str(o.billing?.address_1),
      address_2: str(o.billing?.address_2),
      city: str(o.billing?.city),
      state: str(o.billing?.state),
    },
    shipping: {
      first_name: str(o.shipping?.first_name),
      last_name: str(o.shipping?.last_name),
      address_1: str(o.shipping?.address_1),
      address_2: str(o.shipping?.address_2),
      city: str(o.shipping?.city),
      state: str(o.shipping?.state),
    },
  };
}

/**
 * Woo has no "phone" filter, so we search and then verify the billing phone.
 * `fetched` is the unfiltered page size — pagination must be driven by that,
 * otherwise a page where some hits are false positives ends the list early.
 * `matched` keeps the untrimmed payloads so we can backfill our mirror.
 */
async function fetchOrdersByPhone(
  phone: string,
  page = 1,
  perPage = 20,
): Promise<{ orders: WooOrderLite[]; fetched: number; matched: unknown[] }> {
  const { wooFetch } = await import("./woo.server");
  const raw = await wooFetch<unknown>({
    path: "/orders",
    query: {
      search: phone,
      per_page: perPage,
      page,
      status: "any",
      orderby: "date",
      order: "desc",
    },
    timeoutMs: 15_000,
  });
  if (!Array.isArray(raw)) return { orders: [], fetched: 0, matched: [] };
  const tail = phone.slice(-10);
  const matched = (raw as WooOrderLite[]).filter((o) => {
    if (!o || typeof o !== "object" || !o.id) return false;
    const p = str(o.billing?.phone).replace(/\D/g, "");
    return p.endsWith(tail);
  });
  return { orders: matched.map(trimOrder), fetched: raw.length, matched };
}

const SYNC_TTL_MS = 15 * 60_000;
const SYNC_PAGE_SIZE = 50;
const SYNC_MAX_PAGES = 4; // caps a first-time sync at 200 orders / 4 upstream calls

/** Is our mirror authoritative for this phone right now? */
async function cacheIsFresh(phone: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("customer_history")
      .select("data")
      .eq("phone", phone)
      .maybeSingle();
    const at = (data?.data as { orders_synced_at?: unknown } | null)?.orders_synced_at;
    return typeof at === "string" && Date.now() - new Date(at).getTime() < SYNC_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * One bounded Woo walk per phone per TTL, mirrored into `orders_cache`. After it
 * completes, every list page (including infinite scroll) is a single indexed
 * Postgres read instead of a Woo `search` scan, which is what makes this screen
 * cheap at scale. Returns whether the mirror can be trusted.
 */
async function syncPhoneOrders(phone: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mapOrderToCacheRow } = await import("./woo.server");
    const all: unknown[] = [];
    for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
      const { fetched, matched } = await fetchOrdersByPhone(phone, page, SYNC_PAGE_SIZE);
      all.push(...matched);
      if (fetched < SYNC_PAGE_SIZE) break;
    }
    if (all.length > 0) {
      const rows = all.map((o) => mapOrderToCacheRow(o as never));
      const { error } = await supabaseAdmin
        .from("orders_cache")
        .upsert(rows as never, { onConflict: "wc_order_id" });
      if (error) {
        console.error("orders_cache backfill failed", error.message);
        return false;
      }
    }
    await supabaseAdmin.from("customer_history").upsert(
      {
        phone,
        data: { orders_synced_at: new Date().toISOString(), orders_count: all.length },
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "phone" },
    );
    return true;
  } catch (e) {
    console.error("syncPhoneOrders failed", e);
    return false;
  }
}

/**
 * Reads the mirror. `total` lets pagination be exact instead of guessed from the
 * page size.
 */
async function fetchOrdersFromCache(
  phone: string,
  page: number,
  perPage: number,
): Promise<{ orders: WooOrderLite[]; total: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = (page - 1) * perPage;
  const { data, error, count } = await supabaseAdmin
    .from("orders_cache")
    .select("wc_order_id, raw", { count: "exact" })
    .eq("customer_phone", phone)
    .order("date_created", { ascending: false })
    .range(from, from + perPage - 1);
  if (error || !Array.isArray(data)) {
    if (error) console.error("orders_cache read failed", error.message);
    return { orders: [], total: 0 };
  }
  const orders = data
    .map((r) => (r as { raw: unknown }).raw)
    .filter(
      (raw): raw is WooOrderLite =>
        !!raw && typeof raw === "object" && !!(raw as WooOrderLite).id,
    )
    .map(trimOrder);
  const events = await fetchStatusEvents(orders.map((o) => o.id));
  for (const o of orders) {
    const ev = events.get(o.id);
    if (ev) o.status_events = ev;
  }
  return { orders, total: count ?? orders.length };
}

/** Real milestone timestamps: first time each status was recorded for the order. */
async function fetchStatusEvents(ids: number[]): Promise<Map<number, Record<string, string>>> {
  const out = new Map<number, Record<string, string>>();
  if (ids.length === 0) return out;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("order_audit_log")
      .select("wc_order_id, after, created_at")
      .in("wc_order_id", ids)
      .order("created_at", { ascending: true })
      .limit(500);
    for (const row of (data ?? []) as {
      wc_order_id: number;
      after: unknown;
      created_at: string;
    }[]) {
      const status = str((row.after as { status?: unknown } | null)?.status);
      if (!status) continue;
      const bucket = out.get(row.wc_order_id) ?? {};
      if (!bucket[status]) bucket[status] = row.created_at;
      out.set(row.wc_order_id, bucket);
    }
  } catch (e) {
    console.error("status events read failed", e);
  }
  return out;
}

export const listOrdersByPhone = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        phone: z.string().trim().min(6).max(20),
        page: z.number().int().min(1).max(50).optional(),
        perPage: z.number().int().min(1).max(50).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    // Authorisation: the phone comes from the signed session cookie, never from
    // the request body — otherwise anyone could enumerate another customer's
    // order history (names, addresses, totals) by guessing a mobile number.
    const { readCustomerSession } = await import("./customer-token.server");
    const sessionPhone = await readCustomerSession();
    const phone = sessionPhone ?? "";
    const page = data.page ?? 1;
    const perPage = data.perPage ?? 20;
    if (!isBdMobile(phone))
      return {
        orders: [] as WooOrderLite[],
        page,
        source: "cache" as const,
        hasMore: false,
        error: "Please sign in again to view your orders.",
      };


    try {
      // Mirror is authoritative once synced; only the first read per TTL touches Woo.
      let trusted = await cacheIsFresh(phone);
      if (!trusted) trusted = await syncPhoneOrders(phone);

      if (trusted) {
        const { orders, total } = await fetchOrdersFromCache(phone, page, perPage);
        return {
          orders,
          page,
          source: "cache" as const,
          hasMore: page * perPage < total,
          error: null as string | null,
        };
      }

      // Woo fallback keeps the screen working if the mirror write failed.
      const { orders, fetched } = await fetchOrdersByPhone(phone, page, perPage);
      return {
        orders,
        page,
        source: "woo" as const,
        hasMore: fetched >= perPage && page < 50,
        error: null as string | null,
      };
    } catch (e) {
      console.error("listOrdersByPhone failed", e);
      return {
        orders: [] as WooOrderLite[],
        page,
        source: "woo" as const,
        hasMore: false,
        error: "Could not load your orders.",
      };
    }
  });


// -------------------- Public: last order billing (for checkout autofill) --------------------

export const getLastOrderByPhone = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z.object({ phone: z.string().trim().min(6).max(20) }).parse(raw),
  )
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    if (!isBdMobile(phone)) return { billing: null };
    try {
      let { orders } = await fetchOrdersFromCache(phone, 1, 1);
      if (orders.length === 0) ({ orders } = await fetchOrdersByPhone(phone, 1, 10));
      if (orders.length === 0) return { billing: null };
      const b = orders[0].billing ?? {};
      const first = (b.first_name ?? "").trim();
      const last = (b.last_name ?? "").trim();
      return {
        billing: {
          name: [first, last].filter(Boolean).join(" "),
          email: (b.email ?? "").trim(),
          phone: (b.phone ?? "").trim(),
          address: (b.address_1 ?? "").trim(),
          thana: (b.city ?? "").trim(),
        },
      };
    } catch (e) {
      console.error("getLastOrderByPhone failed", e);
      return { billing: null };
    }
  });
