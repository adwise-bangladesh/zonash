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
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  short_description: string;
  description: string;
  images: { id: number; src: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  average_rating: string;
  rating_count: number;
};

export type WooOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  date_created: string;
  date_modified: string;
  payment_method: string;
  payment_method_title: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    city: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    country: string;
  };
  line_items: {
    id: number;
    name: string;
    product_id: number;
    quantity: number;
    total: string;
  }[];
};
