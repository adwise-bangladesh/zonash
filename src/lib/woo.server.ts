// Server-only helper for calling WooCommerce. Never import from client code —
// the consumer key/secret must never touch the browser.
//
// Two transports are supported so the same code runs on Lovable hosting and on
// a self-hosted Docker box:
//
//   1. Direct  — set WC_STORE_URL + WC_CONSUMER_KEY + WC_CONSUMER_SECRET.
//                Talks straight to <store>/wp-json/wc/v3 with Basic auth.
//                This is the mode to use on your own server: no dependency on
//                Lovable infrastructure.
//   2. Gateway — set LOVABLE_API_KEY + WOOCOMMERCE_API_KEY (Lovable hosting
//                default, injected by the WooCommerce connector).
//
// Direct mode wins when configured, so a self-hosted deploy never silently
// falls back to the gateway.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/woocommerce";

type WooTarget = { base: string; headers: Record<string, string> };

import {
  allowRequest,
  recordFailure,
  recordSuccess,
  WooCircuitOpenError,
} from "@/lib/woo-breaker";


/** Resolve transport + auth headers from env. Called per request (Workers inject env at call time). */
function resolveWooTarget(): WooTarget {
  const storeUrl = process.env.WC_STORE_URL;
  const ck = process.env.WC_CONSUMER_KEY;
  const cs = process.env.WC_CONSUMER_SECRET;
  if (storeUrl && ck && cs) {
    const basic = btoa(`${ck}:${cs}`);
    return {
      base: `${storeUrl.replace(/\/+$/, "")}/wp-json/wc/v3`,
      headers: { Authorization: `Basic ${basic}` },
    };
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  const wooKey = process.env.WOOCOMMERCE_API_KEY;
  if (lovableKey && wooKey) {
    return {
      base: GATEWAY_URL,
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": wooKey },
    };
  }

  throw new Error(
    "WooCommerce is not configured. Set WC_STORE_URL + WC_CONSUMER_KEY + WC_CONSUMER_SECRET (direct) " +
      "or LOVABLE_API_KEY + WOOCOMMERCE_API_KEY (connector gateway).",
  );
}


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
// Product-detail lookups (`/products?slug=…`, `/products/<id>/variations`) get
// their own partition. They are hot (every PDP view) but their key space is as
// large as the catalogue, so leaving them in the shared map meant a crawler
// walking product URLs evicted the feed/taxonomy entries that every visitor
// reads. Sized to hold the realistic hot set of a storefront catalogue.
const MAX_DETAIL_ENTRIES = 300;
// Negative cache: an upstream failure is remembered briefly so a WooCommerce
// outage cannot be amplified into 1 000 origin requests per minute (each of
// which would also retry). Short enough that recovery is near-instant.
const ERROR_TTL_MS = 5_000;
const MAX_ERROR_ENTRIES = 200;
const getCache = new Map<string, CacheEntry>();
const volatileCache = new Map<string, CacheEntry>();
const detailCache = new Map<string, CacheEntry>();
const errorCache = new Map<string, { at: number; error: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Search/sku lookups are user-controlled and unbounded — keep them apart.
 *
 * `page` is user-controlled too and was NOT partitioned: the schema accepts
 * `page` up to 500, so a crawler walking `/products?page=1..500` (no search
 * term needed) minted 500 distinct entries in the SHARED map and evicted the
 * hot keys — feed page 1, the taxonomy snapshot — that every real visitor
 * reads. That is the exact eviction attack the search partition exists to
 * stop, reachable through a different parameter. Real browsing never runs
 * deeper than a handful of pages, so anything past page 5 is treated as
 * volatile: still cached, but only able to evict other deep pages.
 */
function isVolatileKey(key: string): boolean {
  if (key.includes("search=") || key.includes("sku=")) return true;
  const page = /[?&]page=(\d+)/.exec(key);
  return page ? Number(page[1]) > 5 : false;
}

function isDetailKey(key: string): boolean {
  return key.includes("slug=") || key.includes("/variations");
}

function cacheFor(key: string): { map: Map<string, CacheEntry>; max: number } {
  if (isVolatileKey(key)) return { map: volatileCache, max: MAX_VOLATILE_ENTRIES };
  if (isDetailKey(key)) return { map: detailCache, max: MAX_DETAIL_ENTRIES };
  return { map: getCache, max: MAX_CACHE_ENTRIES };
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


// How long an expired entry may still be served when the breaker is open.
// A slightly stale product price beats an error page during an origin outage.
const STALE_MAX_MS = 10 * 60_000;

function cacheGet(key: string): unknown | undefined {
  const { map } = cacheFor(key);
  const e = map.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > GET_TTL_MS) {
    // Kept (not deleted) so `staleGet` can still serve it while the origin is
    // failing; the normal LRU sweep in `cacheSet` reclaims it.
    return undefined;
  }
  return e.value;
}

/** Expired-but-recent value, used only on the circuit-open path. */
function staleGet(key: string): unknown | undefined {
  const { map } = cacheFor(key);
  const e = map.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > STALE_MAX_MS) {
    map.delete(key);
    return undefined;
  }
  return e.value;
}

function cacheSet(key: string, value: unknown) {
  const { map, max } = cacheFor(key);
  // Delete-then-set so the Map's insertion order is a true recency order.
  // Without this, refreshing an existing hot key kept its original (oldest)
  // position, so the "drop oldest" sweep below evicted the *most requested*
  // entries first — exactly the ones a 100k-visitor burst re-reads.
  map.delete(key);
  if (map.size >= max) {
    // Drop oldest ~10% to keep memory bounded.
    const drop = Math.ceil(max * 0.1);
    let i = 0;
    for (const k of map.keys()) {
      if (i++ >= drop) break;
      map.delete(k);
    }
  }
  map.set(key, { at: Date.now(), value });
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
  const target = resolveWooTarget();

  const url = new URL(`${target.base}${req.path.startsWith("/") ? req.path : `/${req.path}`}`);

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
    // Global breaker: while WooCommerce is unhealthy, prefer a slightly stale
    // payload and otherwise fail instantly (no 8s timeout per request, no
    // origin traffic) instead of letting every distinct URL discover the
    // outage on its own.
    if (!allowRequest()) {
      const stale = staleGet(cacheKey);
      if (stale !== undefined) return stale as T;
      throw new WooCircuitOpenError();
    }
  } else if (!allowRequest()) {
    // Writes are not cacheable and must not be silently swallowed, but there is
    // no point posting into a dead origin either.
    throw new WooCircuitOpenError();
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
            ...target.headers,
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
      const wooErr = new WooError(res.status, text);
      // 429/5xx feed the breaker; 4xx (missing slug, bad param) do not — a
      // healthy origin answering "not found" must never trip it.
      recordFailure(wooErr);
      throw wooErr;
    }
    // A real 2xx from origin: the breaker counts this toward recovery.
    recordSuccess();

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

/**
 * Extract the real `-WxH` generated sizes from a WordPress `srcset` string.
 * Returns e.g. `"240x300 600x750 768x960 820x1024"`, or `""` when unknown.
 */
function compactGeneratedSizes(srcset: string | undefined): string {
  if (!srcset) return "";
  const out = new Set<string>();
  for (const m of srcset.matchAll(/-(\d{2,5})x(\d{2,5})\.[a-z0-9]+/gi)) {
    out.add(`${m[1]}x${m[2]}`);
  }
  return [...out].sort((a, b) => parseInt(a) - parseInt(b)).join(" ");
}

export function trimProduct(p: WooProduct): WooProduct {
  return {
    ...p,
    images: (p.images ?? []).slice(0, 8).map((i) => ({
      id: i.id,
      src: i.src,
      alt: i.alt ?? "",
      // Compact list of the generated sizes WordPress ACTUALLY produced for
      // this upload ("240x300 600x750 …"). ~35 bytes per image, and it stops
      // the client from guessing square crops that 404 on portrait uploads.
      ...(compactGeneratedSizes(i.srcset) ? { w: compactGeneratedSizes(i.srcset) } : {}),
    })),
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

/**
 * Per-product memo for the derived "cheapest variation's regular price".
 *
 * Why a dedicated map instead of `cachedDerived`: that cache is capped at 100
 * entries and holds the expensive shared singletons (`categories:index`, the
 * slug map, the primary-category projection). Writing one entry per product id
 * into it would evict a 5-call taxonomy walk to make room for a single card's
 * strikethrough price.
 *
 * `null` is cached too — a product with no markdown is the common case, and
 * without a negative entry every list render re-asked upstream the moment the
 * 30s `wooFetch` window lapsed. Variation prices change on the order of days,
 * so a 10-minute memo is both safe and ~20x longer-lived than the raw HTTP
 * cache it sits on top of.
 */
const VAR_REGULAR_TTL_MS = 600_000;
const MAX_VAR_REGULAR_ENTRIES = 1_000;
const varRegularCache = new Map<number, { at: number; value: string | null }>();
const varRegularInflight = new Map<number, Promise<string | null>>();

/**
 * Hard ceiling on how long enrichment may hold the SSR response.
 *
 * The old loop awaited `ceil(N/6)` sequential batches at a 6s timeout each: a
 * 24-card page of variable products could add **24 seconds** to a single SSR
 * render while a struggling variations endpoint timed out wave after wave. On
 * Workers that occupies the request the whole time. Past the deadline the
 * remaining products are returned un-enriched, which is exactly the existing
 * per-product failure behaviour (no strikethrough) — no functional change,
 * just a bounded tail.
 */
const ENRICH_DEADLINE_MS = 2_500;

function varRegularGet(id: number): string | null | undefined {
  const e = varRegularCache.get(id);
  if (!e) return undefined;
  if (Date.now() - e.at > VAR_REGULAR_TTL_MS) {
    varRegularCache.delete(id);
    return undefined;
  }
  return e.value;
}

function varRegularSet(id: number, value: string | null) {
  varRegularCache.delete(id);
  if (varRegularCache.size >= MAX_VAR_REGULAR_ENTRIES) {
    const drop = Math.ceil(MAX_VAR_REGULAR_ENTRIES * 0.1);
    let i = 0;
    for (const k of varRegularCache.keys()) {
      if (i++ >= drop) break;
      varRegularCache.delete(k);
    }
  }
  varRegularCache.set(id, { at: Date.now(), value });
}

async function fetchVarRegular(id: number): Promise<string | null> {
  const vars = await wooFetch<WooVariation[]>({
    path: `/products/${id}/variations`,
    query: { per_page: 100, status: "publish", _fields: "price,regular_price" },
    timeoutMs: 6000,
  });
  if (!Array.isArray(vars) || !vars.length) return null;
  let best: { price: number; regular: number } | null = null;
  for (const v of vars) {
    const price = Number.parseFloat(v?.price ?? "");
    if (!Number.isFinite(price) || price <= 0) continue;
    const reg = Number.parseFloat(v?.regular_price ?? "");
    if (!best || price < best.price) {
      best = { price, regular: Number.isFinite(reg) ? reg : 0 };
    }
  }
  // Only meaningful when it is actually a markdown.
  return best && best.regular > best.price ? String(best.regular) : null;
}

/** Memoized + single-flighted resolve of one product's regular price. */
function resolveVarRegular(id: number): Promise<string | null> {
  const pending = varRegularInflight.get(id);
  if (pending) return pending;
  const p = fetchVarRegular(id)
    .then((value) => {
      varRegularSet(id, value);
      return value;
    })
    // A variation lookup failure just means no strikethrough on that card.
    // Deliberately NOT memoized: `wooFetch`'s own 5s negative cache already
    // absorbs the stampede, and a 10-minute negative entry would hide a real
    // price for far too long after recovery.
    .catch(() => null)
    .finally(() => {
      varRegularInflight.delete(id);
    });
  varRegularInflight.set(id, p);
  return p;
}

/**
 * Fill `min_regular_price` for variable products in a list payload.
 *
 * Woo's `/products` response returns an empty `regular_price` and a plain
 * price range (no `<del>`) for variable products, so cards could only ever
 * render the sale price. Variations carry the real regular price.
 *
 * Scale notes: this used to issue one upstream call per variable product on
 * every list request, with only `wooFetch`'s 30s window in front of it, and no
 * coalescing across the products of a single page. It is now backed by a
 * 10-minute per-product memo (positive *and* negative), single-flighted per
 * product id across concurrent requests, and bounded by an overall deadline.
 */
export async function enrichVariableRegular(products: WooProduct[]): Promise<WooProduct[]> {
  const found = new Map<number, string>();
  const misses: number[] = [];
  const seen = new Set<number>();

  for (const p of products) {
    if (p?.type !== "variable" || p.min_regular_price) continue;
    // A page can legitimately repeat an id (SKU probe merged into text hits
    // upstream of a de-dupe); resolving it twice cost two map lookups and, on
    // a cold isolate, could race two inflight entries.
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const memo = varRegularGet(p.id);
    if (memo !== undefined) {
      if (memo) found.set(p.id, memo);
      continue;
    }
    misses.push(p.id);
  }

  if (misses.length) {
    const deadline = Date.now() + ENRICH_DEADLINE_MS;
    const BATCH = 6;
    for (let i = 0; i < misses.length; i += BATCH) {
      // Stop starting new waves once the budget is spent; already-started work
      // still populates the memo for the next request, so nothing is wasted.
      if (Date.now() >= deadline) break;
      const slice = misses.slice(i, i + BATCH);
      const results = await Promise.all(slice.map((id) => resolveVarRegular(id)));
      for (let j = 0; j < slice.length; j++) {
        const value = results[j];
        if (value) found.set(slice[j], value);
      }
    }
  }

  if (!found.size) return products;
  return products.map((p) =>
    found.has(p.id) ? { ...p, min_regular_price: found.get(p.id) } : p,
  );
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
  images: { id: number; src: string; alt: string; srcset?: string; w?: string }[];
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
  /**
   * Derived: lowest regular (pre-sale) price across a variable product's
   * variations. Woo's list payload leaves `regular_price` empty for variable
   * products and its `price_html` range omits the strikethrough, so the card
   * had no way to show the crossed-out price. Filled by `enrichVariableRegular`.
   */
  min_regular_price?: string;
};

export type WooVariation = {
  id: number;
  sku?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  image?: { id: number; src: string; alt: string; srcset?: string; w?: string };
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


