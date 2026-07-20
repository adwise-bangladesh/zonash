// Server-only helper for calling WooCommerce through the Lovable connector gateway.
// Never import from client code. Consumer key/secret never touch the browser.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/woocommerce";

type WooRequest = {
  path: string; // starts with /
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
};

export class WooError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`WooCommerce ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

export async function wooFetch<T = unknown>(req: WooRequest): Promise<T> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const wooKey = process.env.WOOCOMMERCE_API_KEY;
  if (!lovableKey || !wooKey) {
    throw new Error("WooCommerce connector env vars are not configured");
  }

  const url = new URL(`${GATEWAY_URL}${req.path.startsWith("/") ? req.path : `/${req.path}`}`);
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 8000);
    try {
      return await fetch(url.toString(), {
        method: req.method ?? "GET",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": wooKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: req.body ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // Retry once on 429/5xx with backoff.
  let res = await attempt();
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 400));
    res = await attempt();
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`WooCommerce request failed [${res.status}]: ${text.slice(0, 500)}`);
    throw new WooError(res.status, text);
  }
  try {
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } catch {
    throw new WooError(res.status, `Non-JSON response: ${text.slice(0, 300)}`);
  }
}

// ---------- Types (partial, only what we use) ----------
export type WooProduct = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type?: string; // "simple" | "variable" | "grouped" | "external"
  sku?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  backorders?: string;
  backorders_allowed?: boolean;
  short_description: string;
  description: string;
  images: { id: number; src: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  variations?: number[];
  attributes?: { id: number; name: string; slug?: string; option?: string; options?: string[]; variation?: boolean; visible?: boolean }[];
  default_attributes?: { id: number; name: string; option: string }[];
  meta_data?: { id?: number; key: string; value: string | number | boolean | null }[];
  average_rating: string;
  rating_count: number;
};

export type WooVariation = {
  id: number;
  sku?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  image?: { id: number; src: string; alt: string };
  attributes: { id: number; name: string; option: string }[];
};


export type WooOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  subtotal?: string;
  shipping_total: string;
  discount_total?: string;
  total_tax?: string;
  date_created: string;
  date_modified: string;
  date_paid?: string | null;
  date_completed?: string | null;
  payment_method: string;
  payment_method_title: string;
  transaction_id?: string;
  customer_ip_address?: string;
  customer_note?: string;
  created_via?: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2?: string;
    city: string;
    state?: string;
    postcode?: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state?: string;
    postcode?: string;
    country: string;
    phone?: string;
  };
  shipping_lines?: { id: number; method_title: string; method_id: string; total: string }[];
  line_items: {
    id: number;
    name: string;
    sku?: string;
    product_id: number;
    variation_id?: number;
    quantity: number;
    subtotal?: string;
    total: string;
    price?: number | string;
    image?: { id: string | number; src: string };
  }[];
};

// ---------- Shared mapper: WooOrder → orders_cache row ----------
export function mapOrderToCacheRow(o: WooOrder) {
  const name = `${o.billing?.first_name ?? ""} ${o.billing?.last_name ?? ""}`.trim();
  const shipName = `${o.shipping?.first_name ?? ""} ${o.shipping?.last_name ?? ""}`.trim();
  const items = (o.line_items ?? []).map((i) => ({
    sku: i.sku ?? null,
    name: i.name,
    product_id: i.product_id,
    variation_id: i.variation_id ?? null,
    qty: i.quantity,
    price: i.price != null ? Number(i.price) : null,
    subtotal: i.subtotal != null ? Number(i.subtotal) : null,
    total: Number(i.total ?? 0),
  }));
  const skus = Array.from(
    new Set(
      (o.line_items ?? [])
        .map((i) => (i.sku ?? "").trim())
        .filter((s) => s.length > 0),
    ),
  );
  return {
    wc_order_id: o.id,
    order_number: o.number,
    status: o.status,
    total: Number(o.total ?? 0),
    subtotal: Number(o.subtotal ?? 0),
    shipping_total: Number(o.shipping_total ?? 0),
    discount_total: Number(o.discount_total ?? 0),
    tax_total: Number(o.total_tax ?? 0),
    currency: o.currency,
    customer_email: o.billing?.email ?? null,
    customer_name: name || null,
    customer_phone: o.billing?.phone ?? null,
    billing_city: o.billing?.city ?? null,
    billing_country: o.billing?.country ?? null,
    shipping_name: shipName || null,
    shipping_address_1: o.shipping?.address_1 ?? null,
    shipping_address_2: o.shipping?.address_2 ?? null,
    shipping_city: o.shipping?.city ?? null,
    shipping_state: o.shipping?.state ?? null,
    shipping_postcode: o.shipping?.postcode ?? null,
    shipping_country: o.shipping?.country ?? null,
    shipping_phone: o.shipping?.phone ?? null,
    payment_method: o.payment_method ?? null,
    payment_method_title: o.payment_method_title ?? null,
    transaction_id: o.transaction_id ?? null,
    ip_address: o.customer_ip_address ?? null,
    source_channel: o.created_via ?? null,
    customer_note: o.customer_note ?? null,
    items_count: (o.line_items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0),
    items: items as never,
    skus,
    date_created: o.date_created,
    date_modified: o.date_modified,
    date_paid: o.date_paid ?? null,
    date_completed: o.date_completed ?? null,
    raw: o as never,

  };
}


