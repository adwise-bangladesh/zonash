import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wooFetch, type WooOrder, type WooProduct } from "./woo.server";

// -------------------- Products (public) --------------------

const listProductsSchema = z.object({
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(50).default(12),
  search: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
});

export const listProducts = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => listProductsSchema.parse(raw ?? {}))
  .handler(async ({ data }) => {
    try {
      const products = await wooFetch<WooProduct[]>({
        path: "/products",
        query: {
          page: data.page,
          per_page: data.perPage,
          search: data.search,
          category: data.category,
          status: "publish",
        },
        timeoutMs: 6000,
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
    const products = await wooFetch<WooProduct[]>({
      path: "/products",
      query: { slug: data.slug },
    });
    return products[0] ?? null;
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
    return wooFetch<WooOrder>({ path: `/orders/${data.id}` });
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

    // Fetch previous status from cache for audit
    const before = await ctx.supabase
      .from("orders_cache")
      .select("wc_order_id, status")
      .eq("wc_order_id", String(data.id))
      .maybeSingle?.();

    const updated = await wooFetch<WooOrder>({
      path: `/orders/${data.id}`,
      method: "PUT",
      body: { status: data.status },
    });

    // Optimistically update cache; webhook will reconcile.
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
