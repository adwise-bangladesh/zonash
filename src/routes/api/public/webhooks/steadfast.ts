/**
 * Steadfast Courier webhook receiver.
 *
 * Steadfast posts JSON with `Authorization: Bearer <api_key>`. We verify it
 * against STEADFAST_API_KEY (timing-safe) and upsert the delivery status
 * onto `order_ops` keyed by consignment_id (falling back to invoice).
 *
 * Payload shapes (see docs):
 *   delivery_status: { notification_type, consignment_id, invoice, status,
 *                      cod_amount, delivery_charge, tracking_message, updated_at }
 *   tracking_update: { notification_type, consignment_id, invoice,
 *                      tracking_message, updated_at }
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

type Payload = {
  notification_type?: string;
  consignment_id?: number | string;
  invoice?: string;
  status?: string;
  tracking_message?: string;
  updated_at?: string;
};

function eqTiming(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/webhooks/steadfast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.STEADFAST_API_KEY;
        if (!apiKey) return new Response("Server misconfigured", { status: 500 });

        const auth = request.headers.get("authorization") ?? "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!bearer || !eqTiming(bearer, apiKey)) {
          return new Response(
            JSON.stringify({ status: "error", message: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        let payload: Payload;
        try {
          payload = (await request.json()) as Payload;
        } catch {
          return new Response(
            JSON.stringify({ status: "error", message: "Invalid JSON" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const cid =
          payload.consignment_id != null ? Number(payload.consignment_id) : null;
        const invoice = payload.invoice ? String(payload.invoice) : null;
        if (!cid && !invoice) {
          return new Response(
            JSON.stringify({ status: "error", message: "Missing consignment_id/invoice" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find the target row. Prefer consignment_id, else invoice (== wc_order_id).
        let wcOrderId: number | null = null;
        if (cid) {
          const { data } = await supabaseAdmin
            .from("order_ops")
            .select("wc_order_id")
            .eq("steadfast_consignment_id", cid)
            .maybeSingle();
          wcOrderId = (data as { wc_order_id?: number } | null)?.wc_order_id ?? null;
        }
        if (!wcOrderId && invoice) {
          const n = Number(invoice);
          if (Number.isFinite(n) && n > 0) wcOrderId = n;
        }
        if (!wcOrderId) {
          // Ack anyway so Steadfast doesn't retry forever.
          return new Response(
            JSON.stringify({ status: "success", message: "No matching order" }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const update: Record<string, unknown> = {
          wc_order_id: wcOrderId,
          steadfast_synced_at: new Date().toISOString(),
        };
        if (cid) update.steadfast_consignment_id = cid;
        if (payload.notification_type === "delivery_status" && payload.status) {
          update.steadfast_status = payload.status;
        }

        const { error } = await supabaseAdmin
          .from("order_ops")
          .upsert(update as never, { onConflict: "wc_order_id" });

        if (error) {
          console.error("steadfast webhook upsert error", error);
          return new Response(
            JSON.stringify({ status: "error", message: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ status: "success", message: "Webhook received successfully." }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
