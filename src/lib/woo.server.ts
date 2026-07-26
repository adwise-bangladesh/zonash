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

// Short-TTL in-isolate cache + single-flight coalescing for GETs.
// - Coalescing: N concurrent identical GETs share one upstream fetch.
// - TTL cache: repeats within TTL return instantly with no origin call.
// - Cloudflare Cache API (Layer 2): shared across all isolates in a colo,
//   surviving isolate recycles. Falls back gracefully when unavailable
//   (local dev / non-Workers runtime).
// Absorbs bursts (e.g. 500 concurrent home visits) so WooCommerce sees ~1
// request per unique GET per TTL window per colo instead of N.
type CacheEntry = { at: number; value: unknown };
const GET_TTL_MS = 30_000;
const EDGE_TTL_SECONDS = 60; // Cloudflare Cache API TTL (edge-shared)
const MAX_CACHE_ENTRIES = 500;
// Volatile (attacker-controllable) keys live in their own small partition.
// `?q=<anything>` has unbounded cardinality: a crawler or a bot walking
// `/products?q=aaa…` used to push 500 unique search payloads through the ONE
// shared map, evicting the genuinely hot keys (feed page 1, taxonomy) that
// every real visitor reads. Partitioning caps the damage: search churn can
// only evict other search entries.
const MAX_VOLATILE_ENTRIES = 80;
// Negative cache: an upstream failure is remembered briefly so a WooCommerce
// outage cannot be amplified into 1 000 origin requests per minute (each of
// which would also retry). Short enough that recovery is near-instant.
const ERROR_TTL_MS = 5_000;
const MAX_ERROR_ENTRIES = 200;
const getCache = new Map<string, CacheEntry>();
const volatileCache = new Map<string, CacheEntry>();
const errorCache = new Map<string, { at: number; error: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Search/sku lookups are user-controlled and unbounded — keep them apart. */
function isVolatileKey(key: string): boolean {
  return key.includes("search=") || key.includes("sku=");
}
function cacheFor(key: string): { map: Map<string, CacheEntry>; max: number } {
  return isVolatileKey(key)
    ? { map: volatileCache, max: MAX_VOLATILE_ENTRIES }
    : { map: getCache, max: MAX_CACHE_ENTRIES };
}



// Synthetic origin for Cache API keys. Must be a valid absolute URL; the
// hostname is arbitrary and never resolved — Cache API only uses it as a key.
const EDGE_CACHE_ORIGIN = "https://woo-cache.internal";

function getEdgeCache(): Cache | null {
  try {
    const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}


function cacheGet(key: string): unknown | undefined {
  const e = getCache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > GET_TTL_MS) {
    getCache.delete(key);
    return undefined;
  }
  return e.value;
}
function cacheSet(key: string, value: unknown) {
  // Delete-then-set so the Map's insertion order is a true recency order.
  // Without this, refreshing an existing hot key kept its original (oldest)
  // position, so the "drop oldest" sweep below evicted the *most requested*
  // entries first — exactly the ones a 100k-visitor burst re-reads.
  getCache.delete(key);
  if (getCache.size >= MAX_CACHE_ENTRIES) {
    // Drop oldest ~10% to keep memory bounded.
    const drop = Math.ceil(MAX_CACHE_ENTRIES * 0.1);
    let i = 0;
    for (const k of getCache.keys()) {
      if (i++ >= drop) break;
      getCache.delete(k);
    }
  }
  getCache.set(key, { at: Date.now(), value });
}

function errorGet(key: string): unknown | undefined {
  const e = errorCache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > ERROR_TTL_MS) {
    errorCache.delete(key);
    return undefined;
  }
  return e.error;
}
function errorSet(key: string, error: unknown) {
  errorCache.delete(key);
  if (errorCache.size >= MAX_ERROR_ENTRIES) {
    // Drop the oldest quarter instead of wiping the whole map: a full clear
    // during an outage removes every active circuit-breaker entry at once and
    // lets the next wave of requests stampede the failing origin again.
    const drop = Math.ceil(MAX_ERROR_ENTRIES * 0.25);
    let i = 0;
    for (const k of errorCache.keys()) {
      if (i++ >= drop) break;
      errorCache.delete(k);
    }
  }
  errorCache.set(key, { at: Date.now(), error });
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
  const method = req.method ?? "GET";
  const cacheable = method === "GET";
  const cacheKey = cacheable ? url.toString() : "";
  const edgeCache = cacheable ? getEdgeCache() : null;
  // Build a stable Request as the Cache API key (path + query, no auth headers).
  const edgeReq = cacheable
    ? new Request(`${EDGE_CACHE_ORIGIN}${url.pathname}${url.search}`, { method: "GET" })
    : null;

  if (cacheable) {
    const hit = cacheGet(cacheKey);
    if (hit !== undefined) return hit as T;
    const pending = inflight.get(cacheKey);
    if (pending) return pending as Promise<T>;
    // Replay a very recent failure instead of hammering a struggling origin.
    const recentError = errorGet(cacheKey);
    if (recentError !== undefined) throw recentError;
  }


  const run = async (): Promise<T> => {
    // Layer 2: try Cloudflare Cache API before hitting origin.
    if (edgeCache && edgeReq) {
      try {
        const cached = await edgeCache.match(edgeReq);
        if (cached && cached.ok) {
          const text = await cached.text();
          const parsed = text ? (JSON.parse(text) as T) : (undefined as T);
          cacheSet(cacheKey, parsed);
          return parsed;
        }
      } catch {
        // Cache read failure is non-fatal; continue to origin.
      }
    }

    const attempt = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 8000);
      try {
        return await fetch(url.toString(), {
          method,
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

    // Retry once on 429/5xx with jittered backoff. Fixed backoff makes every
    // isolate in a burst retry in lockstep, re-creating the spike that caused
    // the 5xx; the jitter spreads the second wave over ~200-600ms.
    let res = await attempt();
    if (!res.ok && (res.status === 429 || res.status >= 500)) {
      // Release the discarded body so the connection is not held open.
      try {
        await res.body?.cancel();
      } catch {
        /* already consumed */
      }
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));
      res = await attempt();
    }


    const text = await res.text();
    if (!res.ok) {
      console.error(`WooCommerce request failed [${res.status}]: ${text.slice(0, 500)}`);
      throw new WooError(res.status, text);
    }
    try {
      const parsed = text ? (JSON.parse(text) as T) : (undefined as T);
      if (cacheable) {
        cacheSet(cacheKey, parsed);
        // Write-through to Cloudflare Cache API (colo-shared).
        if (edgeCache && edgeReq) {
          try {
            const cacheRes = new Response(text, {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                // Stale-while-revalidate: serve cached instantly for 60s, then
                // continue serving stale for up to 10 min while a background
                // refresh hits WooCommerce. Keeps LCP flat under load spikes.
                "Cache-Control": `public, max-age=${EDGE_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=600, stale-if-error=86400`,
              },
            });
            // Fire and forget — do not block the response.
            void edgeCache.put(edgeReq, cacheRes);
          } catch {
            // Cache write failure is non-fatal.
          }
        }
      }
      return parsed;
    } catch {
      throw new WooError(res.status, `Non-JSON response: ${text.slice(0, 300)}`);
    }
  };

  if (!cacheable) return run();

  const p = run()
    .catch((err: unknown) => {
      errorSet(cacheKey, err);
      throw err;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });
  // Attach a no-op rejection handler so a coalesced failure never surfaces as
  // an unhandled rejection when the awaiting caller has already bailed out.
  p.catch(() => {});
  inflight.set(cacheKey, p);
  return p;

}

/**
 * Storefront product projection.
 *
 * WooCommerce returns ~60 fields per product, and every image carries a
 * `srcset` string, a `sizes` string, a `thumbnail` URL and four timestamps.
 * At 18 products per feed page that is tens of kilobytes of JSON that is
 * embedded twice (SSR HTML + dehydrated Query cache) and shipped to every
 * visitor. `_fields` trims it at the origin; `trimProducts` trims what
 * `_fields` cannot reach (nested image/category objects).
 */
export const PRODUCT_FIELDS = [
  "id",
  "name",
  "slug",
  "permalink",
  "type",
  "sku",
  "price",
  "regular_price",
  "sale_price",
  "price_html",
  "on_sale",
  "stock_status",
  "backorders",
  "backorders_allowed",
  "short_description",
  "description",
  "images",
  "categories",
  "tags",
  "weight",
  "dimensions",
  "variations",
  "attributes",
  "default_attributes",
  "average_rating",
  "rating_count",
].join(",");

export function trimProduct(p: WooProduct): WooProduct {
  return {
    ...p,
    images: (p.images ?? []).slice(0, 8).map((i) => ({ id: i.id, src: i.src, alt: i.alt ?? "" })),
    categories: (p.categories ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    tags: (p.tags ?? []).map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  };
}

export function trimProducts(list: unknown): WooProduct[] {
  return Array.isArray(list)
    ? (list as WooProduct[]).filter((p) => p && typeof p.id === "number").map(trimProduct)
    : [];
}

/**
 * Derived-result cache with single-flight.
 *
 * `wooFetch` caches raw upstream pages, but some endpoints (e.g. the category
 * browser index) need N pages + local relationship math per request. Under a
 * 100k-visitor burst that recomputation is repeated by every request that
 * arrives on a cold isolate. This memoizes the *computed* result per isolate
 * and coalesces concurrent computations into one.
 */
type DerivedEntry = { at: number; value: unknown };
const derivedCache = new Map<string, DerivedEntry>();
const derivedInflight = new Map<string, Promise<unknown>>();
const MAX_DERIVED_ENTRIES = 100;

export async function cachedDerived<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = derivedCache.get(key);
  if (hit && Date.now() - hit.at <= ttlMs) return hit.value as T;
  if (hit) derivedCache.delete(key);

  const pending = derivedInflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = compute()
    .then((value) => {
      // Evict the oldest entries only. A full `clear()` also dropped
      // `categories:index` — the most expensive value in the map (up to 5
      // paginated upstream calls) — forcing a taxonomy re-walk for the next
      // request on this isolate.
      if (derivedCache.size >= MAX_DERIVED_ENTRIES) {
        const drop = Math.ceil(MAX_DERIVED_ENTRIES * 0.25);
        let i = 0;
        for (const k of derivedCache.keys()) {
          if (i++ >= drop) break;
          derivedCache.delete(k);
        }
      }
      derivedCache.delete(key);

      derivedCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      derivedInflight.delete(key);
    });
  p.catch(() => {});
  derivedInflight.set(key, p);
  return p;
}

/**
 * Category projection: WooCommerce categories carry description HTML, yoast
 * blobs and a fully expanded image object. The category browser reads only
 * name/slug/image.src, so everything else is dropped before it is embedded in
 * SSR HTML and the dehydrated Query cache.
 */
export function trimCategories<T extends { id?: number; name?: string; slug?: string; count?: number; parent?: number; image?: { src?: string; alt?: string } | null }>(
  list: unknown,
): { id: number; name: string; slug: string; count: number; parent: number; image: { src: string; alt: string } | null }[] {
  if (!Array.isArray(list)) return [];
  const out: { id: number; name: string; slug: string; count: number; parent: number; image: { src: string; alt: string } | null }[] = [];
  for (const raw of list as T[]) {
    if (!raw || typeof raw !== "object") continue;
    const slug = typeof raw.slug === "string" ? raw.slug : "";
    if (!slug) continue;
    const src = typeof raw.image?.src === "string" ? raw.image.src : "";
    out.push({
      id: typeof raw.id === "number" ? raw.id : 0,
      name: typeof raw.name === "string" ? raw.name : slug,
      slug,
      count: typeof raw.count === "number" ? raw.count : 0,
      parent: typeof raw.parent === "number" ? raw.parent : 0,
      image: src ? { src, alt: typeof raw.image?.alt === "string" ? raw.image.alt : "" } : null,
    });
  }
  return out;
}




/**
 * One shared, single-flighted snapshot of the WHOLE category taxonomy
 * (id/parent/name/slug/count/image), memoized per isolate for 5 minutes.
 *
 * Both the category rail and every sub-category pane are derived from this one
 * dataset, so a burst of visitors browsing N different parents costs 0 extra
 * upstream WooCommerce calls instead of 2 sequential calls per parent.
 */
export type CategoryIndexRow = {
  id: number;
  name: string;
  slug: string;
  count: number;
  parent: number;
  image: { src: string; alt: string } | null;
};

export function categoryIndex(): Promise<CategoryIndexRow[]> {
  return cachedDerived<CategoryIndexRow[]>("categories:index", 300_000, async () => {
    const fetchPage = (page: number) =>
      wooFetch<unknown>({
        path: "/products/categories",
        query: {
          per_page: 100,
          page,
          hide_empty: false,
          orderby: "name",
          order: "asc",
          _fields: "id,parent,name,slug,count,image",
        },
        timeoutMs: 10_000,
      })
        .then((b) => trimCategories(b))
        .catch(() => [] as CategoryIndexRow[]);

    const first = await fetchPage(1);
    if (first.length < 100) return first;
    // Bigger catalog: remaining pages in parallel, not sequentially.
    const rest = await Promise.all([2, 3, 4, 5].map(fetchPage));
    return first.concat(...rest);
  });
}

/**
 * Slug -> term-id lookup derived from the same taxonomy snapshot.
 *
 * Resolving `?category=<slug>` used to run `Array.prototype.find` over the
 * whole category list on every request (O(categories) per slug, per request).
 * At 100k visitors that is pure wasted CPU on the hot path — the Map is built
 * once per snapshot window and shared by every request on the isolate.
 */
export function categorySlugMap(): Promise<Map<string, number>> {
  return cachedDerived<Map<string, number>>("categories:slugmap", 300_000, async () => {
    const rows = await categoryIndex();
    const m = new Map<string, number>();
    for (const c of rows) if (c.slug) m.set(c.slug, c.id);
    return m;
  });
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
  price_html?: string;
  on_sale: boolean;
  stock_status: string;
  backorders?: string;
  backorders_allowed?: boolean;
  short_description: string;
  description: string;
  images: { id: number; src: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  tags?: { id: number; name: string; slug: string }[];
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
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
  menu_order?: number;
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


