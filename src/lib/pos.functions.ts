/**
 * POS (manual order entry) — server function.
 * Creates a WooCommerce order from staff-entered data with a channel tag.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const lineItemSchema = z.object({
  product_id: z.number().int().positive(),
  variation_id: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(999),
  price: z.number().min(0).optional(), // override unit price
});

const posOrderSchema = z.object({
  channel: z.enum([
    "phone",
    "whatsapp",
    "messenger",
    "instagram",
    "instore",
    "other",
  ]),
  status: z.enum(["on-hold", "processing"]).default("processing"),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(3).max(30),
    email: z.string().trim().email().max(160).optional().or(z.literal("")),
    address: z.string().trim().min(1).max(400),
    thana: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  }),
  items: z.array(lineItemSchema).min(1).max(50),
  shipping_amount: z.number().min(0).max(100000),
  shipping_label: z.string().trim().max(120).default("Delivery"),
  discount: z.number().min(0).max(1_000_000).default(0),
});

async function staffName(
  context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string },
) {
  try {
    const { data } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    return data?.full_name || data?.email || "Staff";
  } catch {
    return "Staff";
  }
}

export const createManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => posOrderSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Ensure caller is staff/admin.
    const { data: isStaff } = await context.supabase.rpc("is_staff_or_admin", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Forbidden");

    const author = await staffName(
      context as { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string },
    );
    const [first_name, ...rest] = data.customer.name.split(" ");
    const last_name = rest.join(" ");

    const billing = {
      first_name: first_name || data.customer.name,
      last_name,
      email: data.customer.email || "",
      phone: data.customer.phone,
      address_1: data.customer.address,
      address_2: data.customer.thana || "",
      city: data.customer.thana || "",
      country: "BD",
    };

    const payload: Record<string, unknown> = {
      status: data.status,
      payment_method: "cod",
      payment_method_title: "Cash on Delivery",
      set_paid: false,
      billing,
      shipping: { ...billing, email: undefined },
      customer_note: data.customer.notes || undefined,
      line_items: data.items.map((i) => ({
        product_id: i.product_id,
        variation_id: i.variation_id,
        quantity: i.quantity,
        ...(i.price != null ? { subtotal: String(i.price * i.quantity), total: String(i.price * i.quantity) } : {}),
      })),
      shipping_lines: [
        {
          method_id: "flat_rate",
          method_title: data.shipping_label,
          total: data.shipping_amount.toFixed(2),
        },
      ],
      fee_lines:
        data.discount > 0
          ? [{ name: "Discount", total: (-Math.abs(data.discount)).toFixed(2) }]
          : [],
      meta_data: [
        { key: "_zonash_channel", value: data.channel },
        { key: "_zonash_created_by", value: author },
        { key: "_zonash_pos", value: "1" },
      ],
    };

    const { wooFetch } = await import("./woo.server");
    const created = await wooFetch<{ id: number; number: string }>({
      path: "/orders",
      method: "POST",
      body: payload,
      timeoutMs: 15000,
    });

    // Log a private note for audit.
    try {
      await wooFetch({
        path: `/orders/${created.id}/notes`,
        method: "POST",
        body: {
          note: `[${author}] Manual order created via POS · channel: ${data.channel}`,
          customer_note: false,
        },
      });
    } catch {
      /* non-fatal */
    }

    return { id: created.id, number: created.number };
  });
