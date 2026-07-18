/**
 * Customer history — aggregates a customer's past Zonash orders by phone,
 * extracts thanas seen in past orders (and courier delivery details when
 * available), and caches the result as JSON in `public.customer_history`
 * for future lookups.
 *
 * The cache is keyed on the normalized 11-digit BD phone.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WooOrder } from "./woo.server";

type Ctx = { supabase: SupabaseClient; userId: string };

export type PastOrder = {
  id: number;
  number: string;
  date: string;
  status: string;
  total: string;
  thana: string;
  address: string;
  items: number;
};

export type CustomerHistory = {
  phone: string;
  thanas: string[];
  orders: PastOrder[];
  courierThanas: string[]; // thanas extracted from Hoorin/courier "police station" hints
  updatedAt: string;
  cached: boolean;
};

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (digits.length === 13 && digits.startsWith("880")) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith("88")) return digits.slice(2);
  return digits.slice(-11);
}

function pickThana(o: WooOrder): string {
  // WooCommerce checkout maps thana → billing.city (with fallback to state).
  return (o.billing?.city || o.shipping?.city || o.billing?.state || "").trim();
}

async function assertStaff(ctx: Ctx) {
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

export const getCustomerHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        phone: z.string().trim().min(6).max(30),
        refresh: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<CustomerHistory> => {
    const ctx = context as unknown as Ctx;
    await assertStaff(ctx);

    const phone = normalizePhone(data.phone);
    if (!phone || phone.length < 10) {
      return {
        phone,
        thanas: [],
        orders: [],
        courierThanas: [],
        updatedAt: new Date().toISOString(),
        cached: false,
      };
    }

    // Serve cache (unless refresh requested)
    if (!data.refresh) {
      const { data: row } = await ctx.supabase
        .from("customer_history")
        .select("data, updated_at")
        .eq("phone", phone)
        .maybeSingle();
      if (row && row.data) {
        const cached = row.data as Omit<CustomerHistory, "cached" | "updatedAt">;
        // Cache TTL: 6 hours; older than that → refetch below
        const age = Date.now() - new Date(row.updated_at).getTime();
        if (age < 6 * 60 * 60 * 1000) {
          return { ...cached, phone, updatedAt: row.updated_at, cached: true };
        }
      }
    }

    // Fetch fresh: past Woo orders + courier (Hoorin) hints
    const { wooFetch } = await import("./woo.server");
    let orders: WooOrder[] = [];
    try {
      orders = await wooFetch<WooOrder[]>({
        path: "/orders",
        query: {
          search: phone,
          per_page: 100,
          status: "any",
          orderby: "date",
          order: "desc",
        },
        timeoutMs: 15000,
      });
      // Filter to those where the billing/shipping phone actually matches.
      orders = orders.filter((o) => {
        const p1 = normalizePhone(o.billing?.phone || "");
        const p2 = normalizePhone(o.shipping?.phone || "");
        return p1 === phone || p2 === phone;
      });
    } catch (e) {
      console.error("getCustomerHistory: woo lookup failed", e);
    }

    const past: PastOrder[] = orders.map((o) => ({
      id: o.id,
      number: o.number,
      date: o.date_created,
      status: o.status,
      total: o.total,
      thana: pickThana(o),
      address: [o.billing?.address_1, o.billing?.city].filter(Boolean).join(", "),
      items: (o.line_items || []).reduce((sum, li) => sum + (li.quantity || 0), 0),
    }));

    const thanas = Array.from(
      new Set(past.map((p) => p.thana).filter((v): v is string => !!v && v.length > 0)),
    );

    // Courier police-station hints from Hoorin details (best-effort).
    const courierThanas: string[] = [];
    try {
      const { hoorinConfigured, hoorinSearch } = await import("./hoorin.server");
      if (hoorinConfigured()) {
        const rep = await hoorinSearch(phone, { cache: "on", timeoutMs: 12_000 });
        const blocks = rep.couriers ?? {};
        const seen = new Set<string>();
        for (const key of Object.keys(blocks) as (keyof typeof blocks)[]) {
          const block = blocks[key];
          for (const d of block?.details ?? []) {
            // Details are free-text; pick words that look like a location/thana.
            // Common pattern: "Delivered — Dhanmondi, Dhaka".
            const parts = String(d).split(/[,\-–—>]+/);
            for (const p of parts) {
              const s = p.trim();
              if (s.length >= 3 && s.length <= 40 && /^[A-Za-z\u0980-\u09FF ]+$/.test(s)) {
                if (!seen.has(s.toLowerCase())) {
                  seen.add(s.toLowerCase());
                  courierThanas.push(s);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("getCustomerHistory: hoorin hint failed", e);
    }

    const payload: Omit<CustomerHistory, "cached"> = {
      phone,
      thanas,
      orders: past,
      courierThanas: courierThanas.slice(0, 20),
      updatedAt: new Date().toISOString(),
    };

    // Upsert cache as JSON for future use.
    try {
      await ctx.supabase
        .from("customer_history")
        .upsert(
          { phone, data: payload as never, updated_at: payload.updatedAt } as never,
          { onConflict: "phone" },
        );
    } catch (e) {
      console.error("getCustomerHistory: cache upsert failed", e);
    }

    return { ...payload, cached: false };
  });
