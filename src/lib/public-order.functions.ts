/**
 * Order lookup for the post-checkout verification flow
 * (unified /order-status timeline page).
 *
 * SECURITY: WooCommerce order ids are sequential, so this endpoint used to be
 * an IDOR — anyone could walk `id=1,2,3…` and harvest every customer's name,
 * phone, email and address. It is now gated on the signed, httpOnly customer
 * session cookie (issued only after a successful OTP verification) AND the
 * session phone must match the order's billing phone. Every flow page that
 * renders this data is reached after OTP verification, so the gate is
 * invisible to legitimate customers.
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
    area: string;
  };
};

export const getPublicOrderById = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ order: PublicOrder | null }> => {
    try {
      // Local 11-digit BD normaliser — kept inside the handler so this
      // server-function module stays a thin wrapper (no module-scope runtime
      // helpers, which the server-fn splitter would strip).
      const normalizePhone = (raw: unknown): string => {
        const digits = String(raw ?? "").replace(/\D+/g, "");
        if (digits.length === 13 && digits.startsWith("880")) return digits.slice(2);
        if (digits.length === 11 && digits.startsWith("01")) return digits;
        return digits.slice(-11);
      };

      const { readCustomerSession } = await import("./customer-token.server");
      const sessionPhone = await readCustomerSession();
      // No verified session → no order data at all. Never reveal whether the
      // id exists: the response is identical for "unauthenticated",
      // "not yours" and "no such order".
      if (!sessionPhone) return { order: null };

      const { wooFetch } = await import("./woo.server");
      const o = await wooFetch<Record<string, unknown>>({
        path: `/orders/${data.id}`,
        timeoutMs: 15_000,
      });
      if (!o?.id) return { order: null };

      const b = (o.billing ?? {}) as Record<string, unknown>;
      if (normalizePhone(b.phone) !== normalizePhone(sessionPhone)) {
        return { order: null };
      }

      const rawLines = Array.isArray(o.line_items)
        ? (o.line_items as Record<string, unknown>[])
        : [];
      const line_items: PublicOrderLine[] = rawLines.map((li) => {
        const meta = Array.isArray(li.meta_data)
          ? (li.meta_data as Record<string, unknown>[])
          : [];
        const variation =
          meta
            .filter(
              (m) =>
                m?.display_key &&
                m?.display_value &&
                !String(m.display_key).startsWith("_"),
            )
            .map((m) => `${m.display_key}: ${m.display_value}`)
            .join(" · ") || undefined;
        return {
          name: String(li.name ?? "Item"),
          quantity: Number(li.quantity ?? 1),
          sku: li.sku ? String(li.sku) : undefined,
          total: li.total ? String(li.total) : undefined,
          image: (li.image as { src?: string } | undefined)?.src || null,
          variation,
        };
      });

      return {
        order: {
          id: Number(o.id),
          number: String(o.number ?? o.id),
          status: String(o.status ?? ""),
          date_created: String(o.date_created ?? ""),
          currency: String(o.currency ?? "BDT"),
          subtotal: String(
            line_items.reduce((s, li) => s + Number(li.total ?? 0), 0).toFixed(2),
          ),
          shipping_total: String(o.shipping_total ?? "0"),
          discount_total: String(o.discount_total ?? "0"),
          total: String(o.total ?? "0"),
          payment_method_title: o.payment_method_title
            ? String(o.payment_method_title)
            : "Cash on Delivery",
          customer_note: o.customer_note ? String(o.customer_note) : "",
          line_items,
          billing: {
            name: [b.first_name, b.last_name].filter(Boolean).join(" ").trim(),
            phone: String(b.phone ?? ""),
            email: b.email ? String(b.email) : undefined,
            address: String(b.address_1 ?? ""),
            area: String(b.city ?? ""),
          },
        },
      };
    } catch (e) {
      console.error("getPublicOrderById failed", e);
      return { order: null };
    }
  });
