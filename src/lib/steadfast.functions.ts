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
