import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WooOrder } from "./woo.server";

/**
 * Staff-only WooCommerce → orders_cache backfill.
 * Pages orders oldest-first so a crash can be resumed by re-running from
 * the last completed page (or by using `after` = last synced date_modified).
 */
const schema = z.object({
  page: z.number().int().min(1).max(100000).default(1),
  perPage: z.number().int().min(1).max(100).default(100),
  after: z.string().datetime().optional(),   // ISO 8601 — filter WC by date_modified
  before: z.string().datetime().optional(),
  status: z.string().max(64).optional(),     // "any" default in WC
});

export const backfillOrdersPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => schema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    // Authorize: staff or admin only
    const { data: isStaff, error: roleErr } = await context.supabase.rpc(
      "is_staff_or_admin",
      { _user_id: context.userId },
    );
    if (roleErr) {
      console.error("role check failed", roleErr);
      throw new Error("Forbidden");
    }
    if (!isStaff) throw new Error("Forbidden");

    const { wooFetch, mapOrderToCacheRow } = await import("./woo.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orders = await wooFetch<WooOrder[]>({
      path: "/orders",
      query: {
        page: data.page,
        per_page: data.perPage,
        orderby: "date",
        order: "asc",
        status: data.status ?? "any",
        modified_after: data.after,
        modified_before: data.before,
      },
      timeoutMs: 20000,
    });

    if (orders.length === 0) {
      return { processed: 0, page: data.page, hasMore: false, lastDate: null as string | null };
    }

    const rows = orders.map(mapOrderToCacheRow);
    const { error } = await supabaseAdmin
      .from("orders_cache")
      .upsert(rows, { onConflict: "wc_order_id" });

    if (error) {
      console.error("backfill upsert failed", error);
      throw new Error(`Upsert failed: ${error.message}`);
    }

    const lastDate = orders[orders.length - 1]?.date_modified ?? null;
    return {
      processed: orders.length,
      page: data.page,
      hasMore: orders.length === data.perPage,
      lastDate,
    };
  });

/** Cheap total-orders count via WC report; used to size progress bars. */
export const getWooOrdersTotal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff_or_admin", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Forbidden");

    const { wooFetch } = await import("./woo.server");
    const totals = await wooFetch<{ slug: string; total: number }[]>({
      path: "/reports/orders/totals",
    });
    const total = totals.reduce((s, t) => s + (t.total ?? 0), 0);
    return { total, byStatus: totals };
  });

/** Current count of rows already cached (fast — indexed COUNT). */
export const getCachedOrdersCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff_or_admin", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Forbidden");

    const { count, error } = await context.supabase
      .from("orders_cache")
      .select("wc_order_id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });
