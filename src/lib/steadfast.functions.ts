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
// Police stations (thana list) — persisted in `public.police_stations`.
// The list never changes, so we read from Postgres. On the very first request
// (empty table) we seed from the Steadfast API once and store forever.
// -----------------------------------------------------------------------------

type PoliceCache = { items: string[]; dhakaCity: string[]; grouped: Record<string, string[]> };
// Tiny per-worker memo so a single request doesn't re-read the same rows.
let _policeMemo: PoliceCache | null = null;

function nameOf(p: unknown): string {
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    const v = o.name ?? o.police_station ?? o.policestation ?? o.thana;
    return typeof v === "string" ? v.trim() : "";
  }
  return "";
}

type PSRow = { district_id: number; district_name: string; name: string; is_dhaka_city: boolean };

async function seedPoliceStationsFromApi(): Promise<PSRow[]> {
  const { sfGetPoliceStations, steadfastConfigured } = await import("./steadfast.server");
  if (!steadfastConfigured()) return [];
  const res = await sfGetPoliceStations();
  const raw: unknown =
    (res as { data?: unknown }).data ??
    (res as { police_stations?: unknown }).police_stations ??
    res;

  const rows: PSRow[] = [];
  const seen = new Set<string>();
  const push = (district_id: number, district_name: string, name: string) => {
    const n = name.trim();
    const d = district_name.trim() || "Other";
    if (!n) return;
    const key = `${district_id}::${n.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ district_id, district_name: d, name: n, is_dhaka_city: district_id === 1 });
  };

  if (Array.isArray(raw)) {
    for (const row of raw as Array<Record<string, unknown>>) {
      const did = typeof row?.id === "number" ? row.id : 0;
      const dname = typeof row?.name === "string" ? row.name : did === 1 ? "Dhaka City" : "";
      const list = (row?.policestations ?? row?.police_stations) as unknown;
      if (Array.isArray(list)) {
        for (const p of list) {
          const n = nameOf(p);
          if (n) push(did, dname, n);
        }
      }
    }
  }

  if (rows.length === 0) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // ignoreDuplicates so concurrent seeds don't fail
  const { error } = await supabaseAdmin
    .from("police_stations" as never)
    .upsert(rows as never, { onConflict: "district_id,name", ignoreDuplicates: true });
  if (error) console.error("police_stations seed error", error.message);
  return rows;
}

async function loadPoliceStations(): Promise<PoliceCache> {
  if (_policeMemo) return _policeMemo;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let { data, error } = await supabaseAdmin
    .from("police_stations" as never)
    .select("district_id, district_name, name, is_dhaka_city")
    .order("name");
  if (error) console.error("police_stations read error", error.message);

  let rows = (data as PSRow[] | null) ?? [];
  if (rows.length === 0) {
    rows = await seedPoliceStationsFromApi();
  }

  const items = new Set<string>();
  const dhakaCity = new Set<string>();
  const grouped: Record<string, Set<string>> = {};
  for (const r of rows) {
    items.add(r.name);
    (grouped[r.district_name] ??= new Set()).add(r.name);
    if (r.is_dhaka_city) dhakaCity.add(r.name);
  }

  const value: PoliceCache = {
    items: Array.from(items).sort((a, b) => a.localeCompare(b)),
    dhakaCity: Array.from(dhakaCity).sort((a, b) => a.localeCompare(b)),
    grouped: Object.fromEntries(
      Object.entries(grouped).map(([k, v]) => [k, Array.from(v).sort((a, b) => a.localeCompare(b))]),
    ),
  };
  if (value.items.length > 0) _policeMemo = value;
  return value;
}

export const getPoliceStations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ items: string[]; grouped: Record<string, string[]> }> => {
    try {
      const { items, grouped } = await loadPoliceStations();
      return { items, grouped };
    } catch (e) {
      console.error("getPoliceStations failed", e);
      return { items: [], grouped: {} };
    }
  });

// Public (no-auth) variant for storefront checkout.
export const getPublicPoliceStations = createServerFn({ method: "GET" })
  .handler(
    async (): Promise<{
      items: string[];
      dhakaCity: string[];
      grouped: Record<string, string[]>;
    }> => {
      try {
        const { items, dhakaCity, grouped } = await loadPoliceStations();
        return { items, dhakaCity, grouped };
      } catch (e) {
        console.error("getPublicPoliceStations failed", e);
        return { items: [], dhakaCity: [], grouped: {} };
      }
    },
  );




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
