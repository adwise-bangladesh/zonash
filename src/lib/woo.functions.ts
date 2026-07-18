import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WooOrder, WooProduct, WooVariation } from "./woo.server";

// -------------------- Products (public) --------------------

const listProductsSchema = z.object({
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(50).default(12),
  search: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  featured: z.boolean().optional(),
  orderby: z.enum(["date", "price", "popularity", "rating", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const listProducts = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => listProductsSchema.parse(raw ?? {}))
  .handler(async ({ data }) => {
    try {
      const { wooFetch } = await import("./woo.server");
      const baseQuery = {
        page: data.page,
        per_page: data.perPage,
        category: data.category,
        featured: data.featured,
        orderby: data.orderby,
        order: data.order,
        status: "publish",
      } as Record<string, unknown>;

      // Run name/description search AND SKU search in parallel, then merge unique.
      const term = data.search?.trim();
      const [byText, bySku] = await Promise.all([
        wooFetch<WooProduct[]>({
          path: "/products",
          query: { ...baseQuery, search: term || undefined },
          timeoutMs: 8000,
        }).catch(() => [] as WooProduct[]),
        term
          ? wooFetch<WooProduct[]>({
              path: "/products",
              query: { ...baseQuery, sku: term },
              timeoutMs: 8000,
            }).catch(() => [] as WooProduct[])
          : Promise.resolve([] as WooProduct[]),
      ]);

      const seen = new Set<number>();
      const products: WooProduct[] = [];
      // SKU matches first — usually the more precise intent for staff.
      for (const p of [...bySku, ...byText]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        products.push(p);
      }
      return { products, error: null as string | null };
    } catch (e) {
      console.error("listProducts failed", e);
      return { products: [] as WooProduct[], error: "Product catalog is temporarily unavailable." };
    }
  });


export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(raw))
  .handler(async ({ data }) => {
    try {
      const products = await (await import("./woo.server")).wooFetch<WooProduct[]>({
        path: "/products",
        query: { slug: data.slug },
      });
      return { product: products[0] ?? null, error: null as string | null };
    } catch (e) {
      console.error("getProductBySlug failed", e);
      return { product: null, error: "Product is temporarily unavailable." };
    }
  });

export type WooCategory = {
  id: number;
  name: string;
  slug: string;
  count: number;
  image: { src: string; alt: string } | null;
};

export const listCategories = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const cats = await (await import("./woo.server")).wooFetch<WooCategory[]>({
        path: "/products/categories",
        query: { per_page: 50, hide_empty: true, orderby: "count", order: "desc" },
      });
      return { categories: cats.filter((c) => c.slug !== "uncategorized"), error: null as string | null };
    } catch (e) {
      console.error("listCategories failed", e);
      return { categories: [] as WooCategory[], error: "Categories are temporarily unavailable." };
    }
  });

// -------------------- Checkout (public) --------------------

const createOrderSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity: z.number().int().positive().max(99),
  })).min(1).max(50),
  billing: z.object({
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(3).max(30),
    address_1: z.string().trim().min(1).max(200),
    address_2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().max(80).optional().default(""),
    postcode: z.string().trim().min(1).max(20),
    country: z.string().trim().length(2),
  }),
  payment_method: z.enum(["cod", "bacs"]).default("cod"),
  customer_note: z.string().max(500).optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => createOrderSchema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const order = await (await import("./woo.server")).wooFetch<WooOrder>({
        path: "/orders",
        method: "POST",
        body: {
          payment_method: data.payment_method,
          payment_method_title: data.payment_method === "cod" ? "Cash on Delivery" : "Direct Bank Transfer",
          set_paid: false,
          status: "pending",
          billing: data.billing,
          shipping: {
            first_name: data.billing.first_name,
            last_name: data.billing.last_name,
            address_1: data.billing.address_1,
            address_2: data.billing.address_2,
            city: data.billing.city,
            state: data.billing.state,
            postcode: data.billing.postcode,
            country: data.billing.country,
          },
          line_items: data.items,
          customer_note: data.customer_note ?? "",
        },
        timeoutMs: 12000,
      });
      return { ok: true as const, id: order.id, number: order.number, total: order.total, currency: order.currency };
    } catch (e) {
      console.error("createOrder failed", e);
      return { ok: false as const, error: "Could not place your order. Please try again." };
    }
  });

// -------------------- Orders (staff/admin only) --------------------

async function assertStaff(ctx: {
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => { in: (col: string, arr: string[]) => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
  userId: string;
}) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .in("role", ["admin", "staff", "viewer"]);
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Forbidden: staff role required");
  }
}

/** Best-effort lookup of the signed-in staff member's display name. */
async function getStaffName(ctx: {
  supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { full_name: string | null; email: string | null } | null; error: unknown }> } } } };
  userId: string;
  claims?: { email?: string } | null;
}): Promise<string> {
  try {
    const { data } = await ctx.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", ctx.userId)
      .maybeSingle();
    const name = data?.full_name?.trim();
    if (name) return name;
    const email = data?.email?.trim() || ctx.claims?.email?.trim();
    if (email) return email.split("@")[0];
  } catch {
    /* ignore */
  }
  return "Staff";
}

export const getWooOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.number().int().positive() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    return (await import("./woo.server")).wooFetch<WooOrder>({ path: `/orders/${data.id}` });
  });

const listWooOrdersSchema = z.object({
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(100).default(25),
  status: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
});

export const listWooOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listWooOrdersSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const { wooFetch } = await import("./woo.server");
      const orders = await wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          page: data.page,
          per_page: data.perPage,
          status: data.status && data.status !== "any" ? data.status : "any",
          search: data.search || undefined,
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 12000,
      });
      return { orders, error: null as string | null };
    } catch (e) {
      console.error("listWooOrders failed", e);
      return { orders: [] as WooOrder[], error: "Could not load orders from WooCommerce." };
    }
  });

// All orders for one customer (by email) — used by the customer history drawer.
export const listCustomerOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ email: z.string().email().max(254) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const { wooFetch } = await import("./woo.server");
      const orders = await wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          search: data.email,
          per_page: 100,
          status: "any",
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 15000,
      });
      // WooCommerce `search` matches many fields; keep only exact billing-email matches.
      const filtered = orders.filter(
        (o) => o.billing?.email?.toLowerCase().trim() === data.email.toLowerCase().trim(),
      );
      return { orders: filtered, error: null as string | null };
    } catch (e) {
      console.error("listCustomerOrders failed", e);
      return { orders: [] as WooOrder[], error: "Could not load customer history." };
    }
  });


// -------------------- Order notes (WooCommerce private/customer notes) --------------------

export type WooOrderNote = {
  id: number;
  author: string;
  date_created: string;
  note: string;
  customer_note: boolean;
};

export const listOrderNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const notes = await (await import("./woo.server")).wooFetch<WooOrderNote[]>({
        path: `/orders/${data.id}/notes`,
        query: { type: "any", per_page: 50 },
        timeoutMs: 10000,
      });
      return { notes, error: null as string | null };
    } catch (e) {
      console.error("listOrderNotes failed", e);
      return { notes: [] as WooOrderNote[], error: "Could not load order notes." };
    }
  });

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        note: z.string().trim().min(1).max(4000),
        customer_note: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const staffName = await getStaffName(context as never);
    const stamped = `[${staffName}] ${data.note}`;
    const created = await (await import("./woo.server")).wooFetch<WooOrderNote>({
      path: `/orders/${data.id}/notes`,
      method: "POST",
      body: { note: stamped, customer_note: data.customer_note },
      timeoutMs: 10000,
    });
    return created;
  });

/**
 * Send an SMS to the order's customer via BDBulkSMS AND log a customer-visible
 * note on the WooCommerce order so the message is preserved in order history.
 */
export const sendCustomerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        message: z.string().trim().min(1).max(1000),
        // Optional override phone; otherwise pulled from the order's billing.phone
        phone: z.string().trim().max(40).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { wooFetch } = await import("./woo.server");

    // 1) Resolve customer phone from the order if not supplied.
    let phone = data.phone?.trim();
    if (!phone) {
      const order = await wooFetch<WooOrder>({
        path: `/orders/${data.id}`,
        timeoutMs: 10000,
      });
      phone = order.billing?.phone?.trim() || "";
    }

    // 2) Send SMS
    const { sendSms } = await import("./sms.server");
    const sms = await sendSms({ phone: phone || "", message: data.message });

    // 3) Log to Woo as a customer-visible note (prefixed) so the trail is preserved.
    const staffName = await getStaffName(context as never);
    const notePrefix = sms.ok ? "📱 SMS sent" : "⚠️ SMS FAILED";
    const noteBody = `[${staffName}] ${notePrefix}${phone ? ` → ${phone}` : ""}\n\n${data.message}${
      sms.ok ? "" : `\n\n(${sms.message})`
    }`;
    try {
      await wooFetch<WooOrderNote>({
        path: `/orders/${data.id}/notes`,
        method: "POST",
        body: { note: noteBody, customer_note: sms.ok },
        timeoutMs: 10000,
      });
    } catch (e) {
      console.error("sendCustomerMessage: note upsert failed", e);
    }

    return {
      ok: sms.ok,
      phone,
      providerMessage: sms.message,
      responseCode: sms.responseCode,
    };
  });






export const getOrderStatusCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    try {
      const totals = await (await import("./woo.server")).wooFetch<
        { slug: string; name: string; total: number }[]
      >({ path: "/reports/orders/totals", timeoutMs: 10000 });
      const counts: Record<string, number> = {};
      let all = 0;
      for (const t of totals) {
        counts[t.slug] = t.total;
        all += t.total;
      }
      counts.any = all;
      return { counts, error: null as string | null };
    } catch (e) {
      console.error("getOrderStatusCounts failed", e);
      return { counts: {} as Record<string, number>, error: "Could not load order counts." };
    }
  });


const updateStatusSchema = z.object({
  id: z.number().int().positive(),
  // Accept any WooCommerce status slug (built-in or custom, e.g. "shipped",
  // "out-for-delivery"). WooCommerce validates the slug on its end.
  status: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Invalid status slug"),
});

// Returns the full list of order statuses registered in WooCommerce
// (built-in + custom), each with its live count. Powers the dynamic tab bar.
export const listOrderStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    try {
      const totals = await (await import("./woo.server")).wooFetch<
        { slug: string; name: string; total: number }[]
      >({ path: "/reports/orders/totals", timeoutMs: 10000 });
      const statuses = totals.map((t) => ({
        // WC prefixes report slugs with "wc-" for some custom statuses; the
        // REST API expects/returns them without the prefix.
        slug: t.slug.replace(/^wc-/, ""),
        name: t.name,
        count: t.total,
      }));
      const all = statuses.reduce((s, x) => s + x.count, 0);
      return { statuses, all, error: null as string | null };
    } catch (e) {
      console.error("listOrderStatuses failed", e);
      return {
        statuses: [] as { slug: string; name: string; count: number }[],
        all: 0,
        error: "Could not load statuses.",
      };
    }
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => updateStatusSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      supabase: {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              in: (col: string, arr: string[]) => Promise<{ data: unknown; error: unknown }>;
              maybeSingle: () => Promise<{ data: { wc_order_id: number; status: string } | null; error: unknown }>;
            };
          };
          insert: (row: unknown) => Promise<{ error: unknown }>;
          update: (row: unknown) => { eq: (col: string, v: number) => Promise<{ error: unknown }> };
        };
      };
      userId: string;
      claims: { email?: string };
    };
    await assertStaff(ctx as never);

    const before = await ctx.supabase
      .from("orders_cache")
      .select("wc_order_id, status")
      .eq("wc_order_id", String(data.id))
      .maybeSingle?.();

    const updated = await (await import("./woo.server")).wooFetch<WooOrder>({
      path: `/orders/${data.id}`,
      method: "PUT",
      body: { status: data.status },
    });

    await ctx.supabase
      .from("orders_cache")
      .update({ status: updated.status, date_modified: updated.date_modified, synced_at: new Date().toISOString() })
      .eq("wc_order_id", data.id);

    await ctx.supabase.from("order_audit_log").insert({
      wc_order_id: data.id,
      actor_user_id: ctx.userId,
      actor_email: ctx.claims?.email ?? null,
      action: "status_change",
      before: { status: before?.data?.status ?? null },
      after: { status: updated.status },
    });

    return { id: updated.id, status: updated.status };
  });

// -------------------- Full order update (staff/admin) --------------------

const addressSchema = z.object({
  first_name: z.string().trim().max(60).optional(),
  last_name: z.string().trim().max(60).optional(),
  company: z.string().trim().max(120).optional(),
  address_1: z.string().trim().max(200).optional(),
  address_2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postcode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(2).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(30).optional(),
});

const lineItemInputSchema = z.object({
  id: z.number().int().positive().optional(),        // existing line item id (update/remove)
  product_id: z.number().int().nonnegative().optional(), // new item
  variation_id: z.number().int().nonnegative().optional(),
  quantity: z.number().int().min(0).max(999),        // 0 removes existing
  subtotal: z.string().max(20).optional(),           // override price (per subtotal)
  total: z.string().max(20).optional(),
});

const feeLineSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().max(120).optional(),
  total: z.string().max(20).optional(),              // negative for discount
});

const shippingLineSchema = z.object({
  id: z.number().int().positive().optional(),
  method_title: z.string().max(120).optional(),
  method_id: z.string().max(60).optional(),
  total: z.string().max(20).optional(),
});

const updateOrderSchema = z.object({
  id: z.number().int().positive(),
  billing: addressSchema.optional(),
  shipping: addressSchema.optional(),
  line_items: z.array(lineItemInputSchema).max(100).optional(),
  fee_lines: z.array(feeLineSchema).max(20).optional(),
  shipping_lines: z.array(shippingLineSchema).max(10).optional(),
  customer_note: z.string().max(2000).optional(),
});

export const updateWooOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => updateOrderSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { id, ...rest } = data;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      body[k] = v;
    }
    const updated = await (await import("./woo.server")).wooFetch<WooOrder>({
      path: `/orders/${id}`,
      method: "PUT",
      body,
      timeoutMs: 15000,
    });
    return updated;
  });

// -------------------- Product variations (staff) --------------------

export const listProductVariations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ productId: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    try {
      const variations = await (await import("./woo.server")).wooFetch<WooVariation[]>({
        path: `/products/${data.productId}/variations`,
        query: { per_page: 100 },
        timeoutMs: 10000,
      });
      return { variations, error: null as string | null };
    } catch (e) {
      console.error("listProductVariations failed", e);
      return { variations: [] as WooVariation[], error: "Could not load variations." };
    }
  });

// -------------------- Shipping methods (staff) --------------------

export type ShippingMethodOption = {
  method_id: string;
  method_title: string;
  cost: string;
  zone_id: number;
  zone_name: string;
  instance_id: number;
};

export const listShippingMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    try {
      const { wooFetch } = await import("./woo.server");
      const zones = await wooFetch<{ id: number; name: string }[]>({
        path: "/shipping/zones",
        timeoutMs: 10000,
      });
      const allZones = zones.some((z) => z.id === 0)
        ? zones
        : [...zones, { id: 0, name: "Rest of the World" }];

      const methods: ShippingMethodOption[] = [];
      await Promise.all(
        allZones.map(async (z) => {
          try {
            const list = await wooFetch<
              {
                id: number;
                instance_id: number;
                title: string;
                method_id: string;
                method_title: string;
                enabled: boolean;
                settings?: Record<string, { id: string; value: string }>;
              }[]
            >({ path: `/shipping/zones/${z.id}/methods`, timeoutMs: 8000 });
            for (const m of list) {
              if (!m.enabled) continue;
              // Cost can live in a few places depending on the method type
              // (flat_rate uses settings.cost, some plugins use min_amount,
              // others expose a top-level cost). Values may look like "80",
              // "80.00", or "৳80" — strip to a plain number-as-string.
              const anyM = m as unknown as Record<string, unknown>;
              const raw =
                (m.settings?.cost?.value as string | undefined) ??
                (m.settings?.min_amount?.value as string | undefined) ??
                (typeof anyM.cost === "string" ? (anyM.cost as string) : undefined) ??
                "0";
              const numeric = String(raw).replace(/[^\d.]/g, "");
              methods.push({
                method_id: m.method_id,
                method_title: m.title || m.method_title,
                cost: numeric || "0",
                zone_id: z.id,
                zone_name: z.name,
                instance_id: m.instance_id,
              });
            }
          } catch (err) {
            console.error(`shipping zone ${z.id} methods failed`, err);
          }
        }),
      );
      return { methods, error: null as string | null };
    } catch (e) {
      console.error("listShippingMethods failed", e);
      return { methods: [] as ShippingMethodOption[], error: "Could not load shipping methods." };
    }
  });

// -------------------- Global search (top-bar) --------------------
// Fans out to multiple WC endpoints and de-dupes.
export const searchOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ q: z.string().trim().min(1).max(120) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const q = data.q.replace(/^#/, "").trim();
    if (!q) return { orders: [] as WooOrder[] };

    const { wooFetch } = await import("./woo.server");
    const isEmail = q.includes("@");
    const digits = q.replace(/\D+/g, "");
    const isMostlyDigits = digits.length >= 4 && digits.length / q.length > 0.6;

    const tasks: Promise<WooOrder[]>[] = [];

    // Direct order ID lookup for numeric queries.
    if (/^\d{1,10}$/.test(q)) {
      tasks.push(
        wooFetch<WooOrder>({ path: `/orders/${q}`, timeoutMs: 6000 })
          .then((o) => (o ? [o] : []))
          .catch(() => []),
      );
    }

    // Broad WC search (covers billing name/email/phone/address).
    tasks.push(
      wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          search: q,
          per_page: 10,
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 8000,
      }).catch(() => [] as WooOrder[]),
    );

    // For phone-like input, also try billing phone via meta search.
    if (isMostlyDigits && digits.length >= 6) {
      tasks.push(
        wooFetch<WooOrder[]>({
          path: "/orders",
          query: { search: digits, per_page: 10, orderby: "date", order: "desc" },
          timeoutMs: 8000,
        }).catch(() => [] as WooOrder[]),
      );
    }

    // Consignment ID lookup — check order_ops table.
    if (!isEmail) {
      tasks.push(
        (async (): Promise<WooOrder[]> => {
          try {
            const { data: rows } = await (context as { supabase: import("@supabase/supabase-js").SupabaseClient })
              .supabase
              .from("order_ops")
              .select("wc_order_id")
              .or(`tracking_number.ilike.%${q}%,consignment_id.ilike.%${q}%`)
              .limit(5);
            const ids = (rows ?? []).map((r: { wc_order_id: number }) => r.wc_order_id);
            const orders = await Promise.all(
              ids.map((id) =>
                wooFetch<WooOrder>({ path: `/orders/${id}`, timeoutMs: 6000 }).catch(() => null),
              ),
            );
            return orders.filter(Boolean) as WooOrder[];
          } catch {
            return [];
          }
        })(),
      );
    }

    const results = (await Promise.all(tasks)).flat();
    const seen = new Set<number>();
    const merged: WooOrder[] = [];
    for (const o of results) {
      if (!o || seen.has(o.id)) continue;
      seen.add(o.id);
      merged.push(o);
      if (merged.length >= 10) break;
    }
    merged.sort(
      (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
    );
    return { orders: merged };
  });



