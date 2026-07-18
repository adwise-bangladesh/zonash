import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listSchema = z.object({
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(100).default(25),
  status: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const listCachedOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: import("@supabase/supabase-js").SupabaseClient };
    const from = (data.page - 1) * data.perPage;
    const to = from + data.perPage - 1;

    let q = ctx.supabase
      .from("orders_cache")
      .select("*", { count: "exact" })
      .order("date_created", { ascending: false })
      .range(from, to);

    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("date_created", data.from);
    if (data.to) q = q.lte("date_created", data.to);
    if (data.search) {
      // Simple ILIKE fallback in addition to FTS
      const s = `%${data.search.replace(/[%_]/g, "")}%`;
      q = q.or(
        `order_number.ilike.${s},customer_email.ilike.${s},customer_name.ilike.${s}`,
      );
    }

    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [], count: count ?? 0, page: data.page, perPage: data.perPage };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as { supabase: import("@supabase/supabase-js").SupabaseClient };
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const [{ data: today }, { data: pending }, { count: totalToday }] = await Promise.all([
      ctx.supabase
        .from("orders_cache")
        .select("total, status")
        .gte("date_created", since.toISOString()),
      ctx.supabase
        .from("orders_cache")
        .select("wc_order_id", { count: "exact", head: true })
        .in("status", ["pending", "processing", "on-hold"]),
      ctx.supabase
        .from("orders_cache")
        .select("wc_order_id", { count: "exact", head: true })
        .gte("date_created", since.toISOString())
        .then((r) => ({ count: r.count ?? 0 })),
    ]);

    const revenue = (today ?? []).reduce((s: number, r: { total: number }) => s + Number(r.total ?? 0), 0);
    const orders = totalToday;
    const aov = orders > 0 ? revenue / orders : 0;

    return {
      todayRevenue: revenue,
      todayOrders: orders,
      todayAov: aov,
      pendingCount: (pending as unknown as { count: number } | null)?.count ?? 0,
    };
  });
