import { WooError, wooFetch } from "./woo.server";

/**
 * Distinct-id enumeration guard for the public reprice endpoint.
 *
 * The endpoint is intentionally unauthenticated (a bag exists before a login
 * does), and everything it returns is already public on the storefront. The
 * residual risk is a scraper walking the id space: cached ids are cheap, but
 * *new* ids each cost an upstream request. So the quota counts unique,
 * uncached ids per client per minute rather than requests — a real shopper
 * with a 200-line bag passes once and is then served from the memo, while a
 * crawler asking for fresh ids runs out almost immediately.
 */
const ENUM_WINDOW_MS = 60_000;
const ENUM_MAX_NEW_IDS = 240;
const ENUM_MAX_CLIENTS = 5000;
const enumBuckets = new Map<string, { at: number; n: number }>();

/** @returns how many of `count` new ids the caller is still allowed to fetch. */
export function enumAllowance(client: string, count: number): number {
  if (!client) return count; // unknown client (local/SSR) — don't penalise
  const now = Date.now();
  const b = enumBuckets.get(client);
  if (!b || now - b.at > ENUM_WINDOW_MS) {
    enumBuckets.set(client, { at: now, n: Math.min(count, ENUM_MAX_NEW_IDS) });
    if (enumBuckets.size > ENUM_MAX_CLIENTS) {
      // Bounded map: drop the oldest insertion rather than growing forever.
      for (const k of enumBuckets.keys()) {
        enumBuckets.delete(k);
        if (enumBuckets.size <= ENUM_MAX_CLIENTS) break;
      }
    }
    return Math.min(count, ENUM_MAX_NEW_IDS);
  }
  const left = Math.max(0, ENUM_MAX_NEW_IDS - b.n);
  const grant = Math.min(count, left);
  b.n += grant;
  return grant;
}

/** True when the key is already memoised, i.e. costs no upstream request. */
export function isCached(l: RepriceLineInput): boolean {
  return readCache(keyOf(l)) !== undefined;
}


export type RepriceLineInput = { productId: number; variationId?: number };

export type RepriceLineResult = {
  productId: number;
  variationId: number | null;
  /** null = unknown (upstream blip); keep the client snapshot. */
  price: number | null;
  regularPrice: number | null;
  /** false = purchasable stock ran out. */
  inStock: boolean;
  /**
   * Remaining purchasable units when the store manages stock for this line.
   * null = untracked (backorder / unmanaged) or unknown.
   */
  stockQty: number | null;
  /** true = product/variation no longer exists or is not published. */
  gone: boolean;
};


type Cached = { at: number; value: Omit<RepriceLineResult, "productId" | "variationId"> };

const TTL_MS = 60_000;
const MAX_ENTRIES = 2000;
/**
 * One bag can ask for up to 50 lines. Without a cap a handful of visitors can
 * fan out into hundreds of concurrent WooCommerce requests, so lookups are
 * memoised for a minute, coalesced per key, and run at a bounded concurrency.
 */
const CONCURRENCY = 8;
/**
 * The per-call cap only bounds one visitor. Under real load (many carts
 * opening at once) each in-flight request could add another 8 sockets to the
 * store, so a process-wide gate bounds the total instead.
 */
const GLOBAL_CONCURRENCY = 16;

let active = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < GLOBAL_CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function release() {
  active--;
  waiters.shift()?.();
}

const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<Cached["value"]>>();

const keyOf = (l: RepriceLineInput) => `${l.productId}:${l.variationId ?? 0}`;

function readCache(key: string): Cached["value"] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function writeCache(key: string, value: Cached["value"]) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function fetchOne(l: RepriceLineInput): Promise<Cached["value"]> {
  await acquire();
  try {
    return await fetchOneInner(l);
  } finally {
    release();
  }
}

async function fetchOneInner(l: RepriceLineInput): Promise<Cached["value"]> {
  const path = l.variationId
    ? `/products/${l.productId}/variations/${l.variationId}`
    : `/products/${l.productId}`;
  try {
    const p = await wooFetch<{
      price: string;
      regular_price: string;
      sale_price: string;
      stock_status: string;
      status?: string;
      purchasable?: boolean;
      manage_stock?: boolean | string;
      stock_quantity?: number | null;
      backorders_allowed?: boolean;
    }>({
      path,
      query: {
        _fields:
          "price,regular_price,sale_price,stock_status,status,purchasable,manage_stock,stock_quantity,backorders_allowed",
      },
      timeoutMs: 6000,
    });

    // A draft/private/trashed product is still readable over the authenticated
    // REST API but cannot be ordered — treat it exactly like a deleted one.
    if (p.status && p.status !== "publish") {
      return { price: null, regularPrice: null, inStock: false, stockQty: null, gone: true };
    }

    const sale = Number(p.sale_price) || 0;
    const base = Number(p.price) || 0;
    const price = sale > 0 ? sale : base;
    const regular = Number(p.regular_price) || 0;

    // A line can be "in stock" and still be un-orderable at the requested
    // quantity. Only report a cap when the store actually tracks units and
    // does not accept backorders.
    const managed = p.manage_stock === true || p.manage_stock === "parent";
    const qty = typeof p.stock_quantity === "number" ? p.stock_quantity : null;
    const stockQty =
      managed && qty !== null && !p.backorders_allowed ? Math.max(0, Math.floor(qty)) : null;

    return {
      price: price > 0 ? price : null,
      regularPrice: regular > price ? regular : null,
      inStock: p.stock_status !== "outofstock" && p.purchasable !== false && stockQty !== 0,
      stockQty,
      gone: false,
    };
  } catch (err) {
    // 404/410 means the product is really gone — say so instead of letting the
    // customer carry a phantom line all the way into a failing order.
    if (err instanceof WooError && (err.status === 404 || err.status === 410)) {
      return { price: null, regularPrice: null, inStock: false, stockQty: null, gone: true };
    }
    // Any other failure is an upstream blip: keep the client's snapshot.
    return { price: null, regularPrice: null, inStock: true, stockQty: null, gone: false };
  }
}


function load(key: string, l: RepriceLineInput): Promise<Cached["value"]> {
  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(key);
  if (running) return running;
  const p = fetchOne(l)
    .then((value) => {
      // Never cache a blip — it must be retried on the next visit.
      if (value.price !== null || value.gone) writeCache(key, value);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export async function repriceLines(
  lines: RepriceLineInput[],
  /**
   * Opaque caller id (IP) used only for the enumeration guard. Omit for
   * trusted internal callers such as order submission, which must never be
   * budget-limited.
   */
  client?: string,
): Promise<RepriceLineResult[]> {
  // De-duplicate first: a malformed or hostile payload can repeat one id 50x.
  const unique = new Map<string, RepriceLineInput>();
  for (const l of lines) if (!unique.has(keyOf(l))) unique.set(keyOf(l), l);
  let entries = [...unique.entries()];

  if (client) {
    // Cached ids are free; only unseen ids consume the budget. Over-budget
    // ids are simply not looked up — they fall through to the "unknown"
    // shape below, which tells the client to keep its own snapshot.
    const cachedEntries = entries.filter(([, l]) => isCached(l));
    const freshEntries = entries.filter(([, l]) => !isCached(l));
    const allowed = enumAllowance(client, freshEntries.length);
    entries = [...cachedEntries, ...freshEntries.slice(0, allowed)];
  }

  const results = new Map<string, Cached["value"]>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const idx = cursor++;
      const [key, line] = entries[idx];
      results.set(key, await load(key, line));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));


  return lines.map((l) => {
    const v = results.get(keyOf(l)) ?? {
      stockQty: null,
      price: null,

      regularPrice: null,
      inStock: true,
      gone: false,
    };
    return { productId: l.productId, variationId: l.variationId ?? null, ...v };
  });
}
