import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mapOrderToCacheRow, type WooOrder } from "@/lib/woo.server";


// WooCommerce sends a base64 HMAC-SHA256 of the raw body using the shared secret
// configured in WooCommerce → Settings → Advanced → Webhooks.

export const Route = createFileRoute("/api/public/webhooks/woo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WC_WEBHOOK_SECRET;
        const signature = request.headers.get("x-wc-webhook-signature") ?? "";
        const topic = request.headers.get("x-wc-webhook-topic") ?? "";
        const deliveryId =
          request.headers.get("x-wc-webhook-delivery-id") ??
          request.headers.get("x-wc-webhook-id") ??
          crypto.randomUUID();

        const body = await request.text();

        if (!secret) {
          console.error("WC_WEBHOOK_SECRET not configured");
          return new Response("Server misconfigured", { status: 500 });
        }

        // Verify HMAC (timing-safe)
        const expected = createHmac("sha256", secret).update(body).digest("base64");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          console.warn("WC webhook signature mismatch");
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency
        const { data: existing } = await supabaseAdmin
          .from("webhook_events")
          .select("delivery_id")
          .eq("delivery_id", deliveryId)
          .maybeSingle();
        if (existing) {
          return new Response("ok (dup)");
        }

        await supabaseAdmin.from("webhook_events").insert({
          delivery_id: deliveryId,
          topic,
          source: "woocommerce",
          payload: null,
        });

        let payload: WooOrder;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // Only handle order.* topics
        if (topic.startsWith("order.")) {
          if (topic === "order.deleted") {
            await supabaseAdmin.from("orders_cache").delete().eq("wc_order_id", payload.id);
          } else {
            const row = mapOrder(payload);
            const { error } = await supabaseAdmin
              .from("orders_cache")
              .upsert(row, { onConflict: "wc_order_id" });
            if (error) {
              console.error("orders_cache upsert failed", error);
              await supabaseAdmin
                .from("webhook_events")
                .update({ error: error.message })
                .eq("delivery_id", deliveryId);
              return new Response("DB error", { status: 500 });
            }
          }
        }

        await supabaseAdmin
          .from("webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("delivery_id", deliveryId);

        return new Response("ok");
      },
    },
  },
});

function mapOrder(o: WooOrder) {
  const name = `${o.billing?.first_name ?? ""} ${o.billing?.last_name ?? ""}`.trim();
  return {
    wc_order_id: o.id,
    order_number: o.number,
    status: o.status,
    total: Number(o.total ?? 0),
    currency: o.currency,
    customer_email: o.billing?.email ?? null,
    customer_name: name || null,
    payment_method: o.payment_method ?? null,
    payment_method_title: o.payment_method_title ?? null,
    items_count: (o.line_items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0),
    date_created: o.date_created,
    date_modified: o.date_modified,
    raw: o as never,
    synced_at: new Date().toISOString(),
  };
}
