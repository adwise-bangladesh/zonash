/**
 * Dashboard-owned operational fields per WooCommerce order:
 *   courier, tracking_number, pickup_slot, internal_notes.
 *
 * Kept in `public.order_ops`, decoupled from the WooCommerce mirror
 * (`orders_cache`) so it works today, independent of backfill progress.
 *
 * Also exposes `getCustomerStats(emails)` — aggregates per-customer totals
 * from `orders_cache` (staff-only via RLS) so the Orders list can render a
 * customer badge: New / Average / Risk / Perfect.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { supabase: SupabaseClient; userId: string };

// ---------- order_ops ----------

export type OrderOps = {
  wc_order_id: number;
  courier: string | null;
  tracking_number: string | null;
  pickup_slot: string | null;
  internal_notes: string | null;
  updated_at: string | null;
};

export const getOrderOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ ids: z.array(z.number().int().positive()).max(500) }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<Record<number, OrderOps>> => {
    const { supabase } = context as unknown as Ctx;
    if (data.ids.length === 0) return {};
    const { data: rows, error } = await supabase
      .from("order_ops")
      .select("wc_order_id, courier, tracking_number, pickup_slot, internal_notes, updated_at")
      .in("wc_order_id", data.ids);
    if (error) throw new Error(error.message);
    const map: Record<number, OrderOps> = {};
    for (const r of (rows ?? []) as OrderOps[]) {
      map[r.wc_order_id] = r;
    }
    return map;
  });

const opsUpdateSchema = z.object({
  wc_order_id: z.number().int().positive(),
  courier: z.string().max(80).nullable().optional(),
  tracking_number: z.string().max(120).nullable().optional(),
  pickup_slot: z.string().max(120).nullable().optional(),
  internal_notes: z.string().max(4000).nullable().optional(),
});

function cleanNullable(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export const updateOrderOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => opsUpdateSchema.parse(raw))
  .handler(async ({ data, context }): Promise<OrderOps> => {
    const { supabase, userId } = context as unknown as Ctx;
    const payload: Record<string, string | null | number> = {
      wc_order_id: data.wc_order_id,
      updated_by: userId,
    };
    const c = cleanNullable(data.courier);
    if (c !== undefined) payload.courier = c;
    const t = cleanNullable(data.tracking_number);
    if (t !== undefined) payload.tracking_number = t;
    const p = cleanNullable(data.pickup_slot);
    if (p !== undefined) payload.pickup_slot = p;
    const n = cleanNullable(data.internal_notes);
    if (n !== undefined) payload.internal_notes = n;

    const { data: row, error } = await supabase
      .from("order_ops")
      .upsert(payload, { onConflict: "wc_order_id" })
      .select("wc_order_id, courier, tracking_number, pickup_slot, internal_notes, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as OrderOps;
  });

// ---------- customer stats + badge ----------

export type CustomerStat = {
  email: string;
  total: number;
  completed: number;
  cancelled: number;
};

export const getCustomerStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        emails: z.array(z.string().email().max(254)).max(500),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<Record<string, CustomerStat>> => {
    const { supabase } = context as unknown as Ctx;
    const emails = Array.from(
      new Set(data.emails.map((e) => e.toLowerCase().trim()).filter(Boolean)),
    );
    if (emails.length === 0) return {};
    const { data: rows, error } = await supabase.rpc("customer_order_stats", {
      emails,
    });
    if (error) throw new Error(error.message);
    const map: Record<string, CustomerStat> = {};
    for (const r of (rows ?? []) as {
      email: string;
      total: number | string;
      completed: number | string;
      cancelled: number | string;
    }[]) {
      map[r.email.toLowerCase()] = {
        email: r.email.toLowerCase(),
        total: Number(r.total || 0),
        completed: Number(r.completed || 0),
        cancelled: Number(r.cancelled || 0),
      };
    }
    return map;
  });

export type CustomerRating = "new" | "average" | "risk" | "perfect";

/**
 * Deterministic badge derivation. `undefined` stats -> "new" (no history yet).
 * - new: total ≤ 1
 * - risk: total ≥ 3 AND cancelRate > 30%
 * - perfect: total ≥ 5 AND cancelled = 0 AND completed ≥ 3
 * - average: everything else
 */
export function ratingFromStats(s?: CustomerStat): CustomerRating {
  if (!s || s.total <= 1) return "new";
  const cancelRate = s.total > 0 ? s.cancelled / s.total : 0;
  if (s.total >= 3 && cancelRate > 0.3) return "risk";
  if (s.total >= 5 && s.cancelled === 0 && s.completed >= 3) return "perfect";
  return "average";
}
