/**
 * Anonymous HTML micro-cache for the storefront's hottest documents.
 *
 * Every visit to `/` renders the whole React tree on the server. The WooCommerce
 * layer is already cached (isolate TTL + colo Cache API), so at 100k visitors the
 * remaining cost is pure render CPU: one full SSR pass per request, repeated for
 * identical output. A 15-second shared cache collapses a burst of N identical
 * anonymous requests into ONE render.
 *
 * Safety rules — deliberately conservative, because a shared HTML cache is a
 * personalization/PII hazard if any of them slips:
 *  - GET only, and only for paths on the allow-list below.
 *  - Requests carrying ANY cookie bypass the cache entirely (read and write), so
 *    a signed-in customer can never be served, or seed, a shared document.
 *  - Responses that set a cookie are never stored.
 *  - Only 200 text/html responses are stored.
 * The cart badge, session phone and location prompts are all client-side, so the
 * anonymous document is genuinely identical between visitors.
 */

/** Paths whose anonymous HTML is identical for every visitor. */
const CACHEABLE_PATHS = new Set(["/"]);

/** Shared-cache lifetime. Short enough that a catalogue edit shows up quickly. */
const TTL_SECONDS = 15;

const CACHE_CONTROL = `public, max-age=0, s-maxage=${TTL_SECONDS}, stale-while-revalidate=60`;

type WaitUntilCtx = { waitUntil?: (p: Promise<unknown>) => void };

function edgeCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

/** A request is shareable only when it is a plain, cookie-less document GET. */
export function isShareableDocumentRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  // Any cookie at all (session, phone, consent) means "possibly personalized".
  if (request.headers.get("cookie")) return false;
  try {
    return CACHEABLE_PATHS.has(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

/** Cache key: origin + path only. Query strings are intentionally not cached. */
function keyFor(request: Request): Request | null {
  try {
    const url = new URL(request.url);
    if (url.search) return null;
    return new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  } catch {
    return null;
  }
}

export async function getCachedDocument(request: Request): Promise<Response | null> {
  const cache = edgeCache();
  const key = cache && keyFor(request);
  if (!cache || !key) return null;
  try {
    const hit = await cache.match(key);
    if (!hit || !hit.ok) return null;
    const res = new Response(hit.body, hit);
    res.headers.set("x-zonash-html-cache", "hit");
    return res;
  } catch {
    return null;
  }
}

/**
 * Store a copy of the rendered document. The response is cloned *before* the
 * caller streams it, so caching never delays the visitor's first byte.
 */
export function putCachedDocument(request: Request, response: Response, ctx: unknown): Response {
  const cache = edgeCache();
  const key = cache && keyFor(request);
  if (!cache || !key) return response;
  if (response.status !== 200) return response;
  if (response.headers.has("set-cookie")) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;

  try {
    const copy = response.clone();
    const headers = new Headers(copy.headers);
    headers.set("Cache-Control", CACHE_CONTROL);
    // Cookie-bearing requests never read this entry, but be explicit for any
    // CDN layer sitting in front of the worker.
    headers.set("Vary", "Cookie");
    const stored = new Response(copy.body, { status: 200, headers });
    // Retained in `pendingPuts` as well as handed to `waitUntil`: an unreferenced
    // floating promise can be dropped when the request context tears down, which
    // silently turns every request into a miss.
    const put = cache
      .put(key, stored)
      .catch(() => {})
      .finally(() => pendingPuts.delete(put));
    pendingPuts.add(put);
    const waitUntil = (ctx as WaitUntilCtx | null)?.waitUntil;
    if (typeof waitUntil === "function") waitUntil.call(ctx, put);

  } catch {
    // Caching is best-effort; never fail a real response because of it.
  }

  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", CACHE_CONTROL);
  out.headers.set("Vary", "Cookie");
  out.headers.set("x-zonash-html-cache", "miss");
  return out;
}
