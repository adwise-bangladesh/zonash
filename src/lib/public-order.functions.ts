/**
 * Public server function: fetch a lightweight view of an order by ID.
 * Used on the post-checkout verification flow pages
 * (order-review, order-callback-choice, order-pending, order-confirmed).
 *
 * We only return non-sensitive fields already known to the buyer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicOrderLine = {
  name: string;
  quantity: number;
  sku?: string;
  total?: string;
  image?: string | null;
  variation?: string;
};

export type PublicOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  currency: string;
  subtotal: string;
  shipping_total: string;
  discount_total: string;
  total: string;
  payment_method_title?: string;
  customer_note?: string;
  line_items: PublicOrderLine[];
  billing: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    thana: string;
  };
};

export const getPublicOrderById = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ order: PublicOrder | null }> => {
    try {
      const { wooFetch } = await import("./woo.server");
      const o = await wooFetch<any>({ path: `/orders/${data.id}`, timeoutMs: 15_000 });
      if (!o?.id) return { order: null };

      const b = o.billing ?? {};
      const line_items: PublicOrderLine[] = Array.isArray(o.line_items)
        ? o.line_items.map((li: any) => {
            const variation =
              (li.meta_data ?? [])
                .filter(
                  (m: any) =>
                    m?.display_key &&
                    m?.display_value &&
                    !String(m.display_key).startsWith("_"),
                )
                .map((m: any) => `${m.display_key}: ${m.display_value}`)
                .join(" · ") || undefined;
            return {
              name: String(li.name ?? "Item"),
              quantity: Number(li.quantity ?? 1),
              sku: li.sku || undefined,
              total: li.total ? String(li.total) : undefined,
              image: li.image?.src || null,
              variation,
            };
          })
        : [];

      return {
        order: {
          id: Number(o.id),
          number: String(o.number ?? o.id),
          status: String(o.status ?? ""),
          date_created: String(o.date_created ?? ""),
          currency: String(o.currency ?? "BDT"),
          subtotal: String(
            line_items
              .reduce((s, li) => s + Number(li.total ?? 0), 0)
              .toFixed(2),
          ),
          shipping_total: String(o.shipping_total ?? "0"),
          discount_total: String(o.discount_total ?? "0"),
          total: String(o.total ?? "0"),
          payment_method_title: o.payment_method_title ?? "Cash on Delivery",
          customer_note: o.customer_note ?? "",
          line_items,
          billing: {
            name: [b.first_name, b.last_name].filter(Boolean).join(" ").trim(),
            phone: String(b.phone ?? ""),
            email: b.email ? String(b.email) : undefined,
            address: String(b.address_1 ?? ""),
            thana: String(b.city ?? ""),
          },
        },
      };
    } catch (e) {
      console.error("getPublicOrderById failed", e);
      return { order: null };
    }
  });
