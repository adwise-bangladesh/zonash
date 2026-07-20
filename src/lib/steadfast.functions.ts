/**
 * Server functions for the Steadfast Courier integration.
 *
 * All calls are staff-authenticated. The dashboard uses these to:
 *   - probe integration health + current balance (settings page)
 *   - push a WooCommerce order to Steadfast as a consignment
 *   - refresh delivery status for a single order
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { supabase: SupabaseClient; userId: string };

// -----------------------------------------------------------------------------
// Settings status + balance
// -----------------------------------------------------------------------------

export const getSteadfastStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { steadfastConfigured, sfGetBalance } = await import("./steadfast.server");
    const configured = steadfastConfigured();
    if (!configured) {
      return { configured: false as const, balance: null, error: null };
    }
    try {
      const b = await sfGetBalance();
      return { configured: true as const, balance: Number(b.current_balance ?? 0), error: null };
    } catch (e) {
      return {
        configured: true as const,
        balance: null,
        error: e instanceof Error ? e.message : "Steadfast API error",
      };
    }
  });

// -----------------------------------------------------------------------------
// Police stations (thana list) — cached at the client via React Query.
// -----------------------------------------------------------------------------

export const getPoliceStations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ items: string[]; grouped: Record<string, string[]> }> => {
    const { sfGetPoliceStations, steadfastConfigured } = await import("./steadfast.server");
    if (!steadfastConfigured()) return { items: [], grouped: {} };
    try {
      const res = await sfGetPoliceStations();
      // Response shape is flexible; try common variants.
      const raw: unknown =
        (res as { data?: unknown }).data ??
        (res as { police_stations?: unknown }).police_stations ??
        res;

      const items = new Set<string>();
      const grouped: Record<string, Set<string>> = {};

      function addPair(city: string | undefined, station: string | undefined) {
        const s = (station || "").toString().trim();
        if (!s) return;
        items.add(s);
        const c = (city || "").toString().trim() || "Other";
        (grouped[c] ??= new Set()).add(s);
      }

      const walk = (node: unknown, cityHint?: string) => {
        if (!node) return;
        if (Array.isArray(node)) {
          for (const it of node) {
            if (typeof it === "string") addPair(cityHint, it);
            else walk(it, cityHint);
          }
          return;
        }
        if (typeof node === "object") {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
              for (const s of v as string[]) addPair(k, s);
            } else if (typeof v === "string" && /station|thana|name/i.test(k)) {
              addPair(cityHint, v);
            } else {
              walk(v, cityHint || (typeof k === "string" ? k : undefined));
            }
          }
        }
      };
      walk(raw);

      const outGrouped: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(grouped)) outGrouped[k] = Array.from(v).sort();
      return { items: Array.from(items).sort(), grouped: outGrouped };
    } catch (e) {
      console.error("getPoliceStations failed", e);
      return { items: [], grouped: {} };
    }
  });

// Public (no-auth) variant for the storefront checkout — thana list is not sensitive.
export const getPublicPoliceStations = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ items: string[]; dhakaCity: string[] }> => {
    const { sfGetPoliceStations, steadfastConfigured } = await import("./steadfast.server");
    if (!steadfastConfigured()) return { items: [], dhakaCity: [] };
    try {
      const res = await sfGetPoliceStations();
      const raw: unknown =
        (res as { data?: unknown }).data ??
        (res as { police_stations?: unknown }).police_stations ??
        res;

      const items = new Set<string>();
      const dhakaCity = new Set<string>();

      const nameOf = (p: unknown): string => {
        if (typeof p === "string") return p.trim();
        if (p && typeof p === "object") {
          const o = p as Record<string, unknown>;
          const v = o.name ?? o.police_station ?? o.policestation ?? o.thana;
          return typeof v === "string" ? v.trim() : "";
        }
        return "";
      };
      const addTo = (set: Set<string>, list: unknown) => {
        if (!Array.isArray(list)) return;
        for (const p of list) {
          const n = nameOf(p);
          if (n) set.add(n);
        }
      };

      // Preferred: structured districts array with { id, name, policestations: [...] }
      if (Array.isArray(raw)) {
        for (const row of raw as Array<Record<string, unknown>>) {
          const ps = (row?.policestations ?? row?.police_stations) as unknown;
          addTo(items, ps);
          if (row?.id === 1 || row?.name === "Dhaka City") addTo(dhakaCity, ps);
        }
      }

      // Fallback walk if the shape was different.
      if (items.size === 0) {
        const walk = (node: unknown) => {
          if (!node) return;
          if (Array.isArray(node)) { for (const it of node) walk(it); return; }
          if (typeof node === "object") {
            for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
              if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
                for (const s of v as string[]) { const t = s.trim(); if (t) items.add(t); }
              } else if (typeof v === "string" && /station|thana|name/i.test(k)) {
                const t = v.trim(); if (t) items.add(t);
              } else walk(v);
            }
          }
        };
        walk(raw);
      }

      return { items: Array.from(items).sort(), dhakaCity: Array.from(dhakaCity).sort() };
    } catch (e) {
      console.error("getPublicPoliceStations failed", e);
      return { items: [], dhakaCity: [] };
    }
  });



// -----------------------------------------------------------------------------
// Send an order to Steadfast
// -----------------------------------------------------------------------------

const sendSchema = z.object({
  wc_order_id: z.number().int().positive(),
  // Optional overrides (fall back to WooCommerce fields when omitted)
  cod_amount: z.number().nonnegative().optional(),
  note: z.string().max(500).optional(),
  delivery_type: z.union([z.literal(0), z.literal(1)]).optional(),
});

function pickAddress(o: {
  shipping?: { first_name?: string; last_name?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; phone?: string };
  billing?: { first_name?: string; last_name?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; phone?: string; email?: string };
}) {
  const s = o.shipping ?? {};
  const b = o.billing ?? {};
  const first = (s.first_name || b.first_name || "").trim();
  const last = (s.last_name || b.last_name || "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim() || "Customer";
  const phone = (s.phone || b.phone || "").replace(/\D+/g, "");
  const addr = [s.address_1 || b.address_1, s.address_2 || b.address_2, s.city || b.city, s.state || b.state, s.postcode || b.postcode]
    .filter(Boolean)
    .join(", ")
    .slice(0, 250);
  return { name, phone, addr, email: b.email ?? undefined };
}

export const sendOrderToSteadfast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => sendSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { wooFetch } = await import("./woo.server");
    const { sfCreateOrder } = await import("./steadfast.server");

    // Load the order from WooCommerce (authoritative)
    const order = await wooFetch<{
      id: number;
      number: string;
      total: string;
      customer_note?: string;
      line_items?: { name: string; quantity: number }[];
      billing?: Record<string, string>;
      shipping?: Record<string, string>;
    }>({ path: `/orders/${data.wc_order_id}` });

    const { name, phone, addr, email } = pickAddress(order);
    if (!phone || phone.length < 10) {
      throw new Error("Recipient phone is missing or invalid on this order.");
    }
    if (!addr) throw new Error("Recipient address is missing on this order.");

    const invoice = String(order.number || order.id);
    const cod = data.cod_amount ?? Number(order.total || 0);
    const itemDesc = (order.line_items ?? [])
      .map((li) => `${li.quantity}× ${li.name}`)
      .join(", ")
      .slice(0, 250);

    const result = await sfCreateOrder({
      invoice,
      recipient_name: name.slice(0, 100),
      recipient_phone: phone.slice(-11),
      recipient_email: email,
      recipient_address: addr,
      cod_amount: Math.max(0, Math.round(cod)),
      note: (data.note ?? order.customer_note ?? "").slice(0, 250) || undefined,
      item_description: itemDesc || undefined,
      delivery_type: data.delivery_type,
    });

    const c = result.consignment;

    // Persist onto order_ops so the drawer/list can display it.
    const payload: Record<string, unknown> = {
      wc_order_id: order.id,
      updated_by: userId,
      courier: "Steadfast",
      tracking_number: c.tracking_code,
      steadfast_consignment_id: c.consignment_id,
      steadfast_tracking_code: c.tracking_code,
      steadfast_status: c.status,
      steadfast_synced_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("order_ops")
      .upsert(payload as never, { onConflict: "wc_order_id" });
    if (error) throw new Error(error.message);

    return {
      consignment_id: c.consignment_id,
      tracking_code: c.tracking_code,
      status: c.status,
    };
  });

// -----------------------------------------------------------------------------
// Bulk send orders to Steadfast (single API call, up to 500 per batch)
// -----------------------------------------------------------------------------

const bulkSendSchema = z.object({
  wc_order_ids: z.array(z.number().int().positive()).min(1).max(500),
});

export const bulkSendOrdersToSteadfast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => bulkSendSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { wooFetch } = await import("./woo.server");
    const { sfCreateBulk } = await import("./steadfast.server");

    type WooOrder = {
      id: number;
      number: string;
      total: string;
      customer_note?: string;
      billing?: Record<string, string>;
      shipping?: Record<string, string>;
    };

    // Fetch orders from Woo in parallel (bounded)
    const orders: WooOrder[] = [];
    const errors: { wc_order_id: number; error: string }[] = [];
    const q = [...data.wc_order_ids];
    async function worker() {
      while (q.length) {
        const id = q.shift()!;
        try {
          const o = await wooFetch<WooOrder>({ path: `/orders/${id}` });
          orders.push(o);
        } catch (e) {
          errors.push({ wc_order_id: id, error: e instanceof Error ? e.message : "fetch failed" });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(8, data.wc_order_ids.length) }, worker));

    // Build bulk payload, skipping invalid rows
    const skipped: { wc_order_id: number; invoice: string; reason: string }[] = [];
    const invoiceToOrderId = new Map<string, number>();
    const items = [] as Array<Parameters<typeof sfCreateBulk>[0][number]>;
    for (const o of orders) {
      const { name, phone, addr } = pickAddress(o);
      const invoice = String(o.number || o.id);
      if (!phone || phone.length < 10) {
        skipped.push({ wc_order_id: o.id, invoice, reason: "Invalid phone" });
        continue;
      }
      if (!addr) {
        skipped.push({ wc_order_id: o.id, invoice, reason: "Missing address" });
        continue;
      }
      invoiceToOrderId.set(invoice, o.id);
      items.push({
        invoice,
        recipient_name: name.slice(0, 100),
        recipient_phone: phone.slice(-11),
        recipient_address: addr,
        cod_amount: Math.max(0, Math.round(Number(o.total || 0))),
        note: (o.customer_note ?? "").slice(0, 250) || undefined,
      });
    }

    const results = items.length > 0 ? await sfCreateBulk(items) : [];

    // Persist successes to order_ops
    const nowIso = new Date().toISOString();
    const upserts = results
      .filter((r) => r.status === "success" && r.consignment_id && r.tracking_code)
      .map((r) => ({
        wc_order_id: invoiceToOrderId.get(r.invoice)!,
        updated_by: userId,
        courier: "Steadfast",
        tracking_number: r.tracking_code!,
        steadfast_consignment_id: r.consignment_id!,
        steadfast_tracking_code: r.tracking_code!,
        steadfast_status: r.status,
        steadfast_synced_at: nowIso,
      }))
      .filter((u) => Number.isFinite(u.wc_order_id));

    if (upserts.length > 0) {
      const { error } = await supabase
        .from("order_ops")
        .upsert(upserts as never, { onConflict: "wc_order_id" });
      if (error) throw new Error(error.message);
    }

    const success = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status !== "success");

    return {
      total: data.wc_order_ids.length,
      sent: items.length,
      success,
      failed: failed.length + skipped.length + errors.length,
      results,
      skipped,
      fetch_errors: errors,
    };
  });


// Refresh delivery status for a single order
// -----------------------------------------------------------------------------

export const refreshSteadfastStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ wc_order_id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { sfStatusByCid, sfStatusByInvoice } = await import("./steadfast.server");

    const { data: row, error } = await supabase
      .from("order_ops")
      .select("wc_order_id, steadfast_consignment_id, steadfast_tracking_code")
      .eq("wc_order_id", data.wc_order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    let status: string;
    const cid = (row as { steadfast_consignment_id?: number | null } | null)?.steadfast_consignment_id;
    if (cid) {
      const r = await sfStatusByCid(cid);
      status = r.delivery_status;
    } else {
      // Fall back to invoice = wc order id
      const r = await sfStatusByInvoice(String(data.wc_order_id));
      status = r.delivery_status;
    }

    await supabase
      .from("order_ops")
      .upsert(
        {
          wc_order_id: data.wc_order_id,
          updated_by: userId,
          steadfast_status: status,
          steadfast_synced_at: new Date().toISOString(),
        } as never,
        { onConflict: "wc_order_id" },
      );

    return { status };
  });
