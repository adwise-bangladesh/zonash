import { WooError, wooFetch } from "./woo.server";

export type RepriceLineInput = { productId: number; variationId?: number };

export type RepriceLineResult = {
  productId: number;
  variationId: number | null;
  /** null = unknown (upstream blip); keep the client snapshot. */
  price: number | null;
  regularPrice: number | null;
  /** false = purchasable stock ran out. */
  inStock: boolean;
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
    }>({
      path,
      query: { _fields: "price,regular_price,sale_price,stock_status,status,purchasable" },
      timeoutMs: 6000,
    });

    // A draft/private/trashed product is still readable over the authenticated
    // REST API but cannot be ordered — treat it exactly like a deleted one.
    if (p.status && p.status !== "publish") {
      return { price: null, regularPrice: null, inStock: false, gone: true };
    }

    const sale = Number(p.sale_price) || 0;
    const base = Number(p.price) || 0;
    const price = sale > 0 ? sale : base;
    const regular = Number(p.regular_price) || 0;
    return {
      price: price > 0 ? price : null,
      regularPrice: regular > price ? regular : null,
      inStock: p.stock_status !== "outofstock" && p.purchasable !== false,
      gone: false,
    };
  } catch (err) {
    // 404/410 means the product is really gone — say so instead of letting the
    // customer carry a phantom line all the way into a failing order.
    if (err instanceof WooError && (err.status === 404 || err.status === 410)) {
      return { price: null, regularPrice: null, inStock: false, gone: true };
    }
    // Any other failure is an upstream blip: keep the client's snapshot.
    return { price: null, regularPrice: null, inStock: true, gone: false };
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

export async function repriceLines(lines: RepriceLineInput[]): Promise<RepriceLineResult[]> {
  // De-duplicate first: a malformed or hostile payload can repeat one id 50x.
  const unique = new Map<string, RepriceLineInput>();
  for (const l of lines) if (!unique.has(keyOf(l))) unique.set(keyOf(l), l);
  const entries = [...unique.entries()];

  const results = new Map<string, Cached["value"]>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const idx = cursor++;
      const [key, line] = entries[idx];
      results.set(key, await load(key, line));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
  );

  return lines.map((l) => {
    const v = results.get(keyOf(l)) ?? {
      price: null,
      regularPrice: null,
      inStock: true,
      gone: false,
    };
    return { productId: l.productId, variationId: l.variationId ?? null, ...v };
  });
}
