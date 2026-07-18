import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WooOrder, WooProduct } from "./woo.server";

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
      const products = await (await import("./woo.server")).wooFetch<WooProduct[]>({
        path: "/products",
        query: {
          page: data.page,
          per_page: data.perPage,
          search: data.search,
          category: data.category,
          featured: data.featured,
          orderby: data.orderby,
          order: data.order,
          status: "publish",
        },
        timeoutMs: 8000,
      });
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

const updateStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum([
    "pending",
    "processing",
    "on-hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
  ]),
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
