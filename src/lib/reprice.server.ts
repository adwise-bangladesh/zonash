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

/**
 * True when the key is served without a *blocking* upstream request — fresh
 * or stale-within-grace both qualify, so a returning shopper is never charged
 * enumeration budget for ids the process already knows.
 */
export function isCached(l: RepriceLineInput): boolean {
  return readStale(keyOf(l)) !== undefined;
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

/**
 * Depth of the admission queue behind the global gate. At 100k visitors an
 * unbounded queue is a memory leak *and* a latency trap: callers pile up for
 * minutes behind a slow store and every one of them is holding a request
 * alive. Past this depth we shed instead — the caller gets the "unknown"
 * shape and keeps its own snapshot, which is exactly the upstream-blip path.
 */
const MAX_QUEUE = 256;
/**
 * The priority lane needs its own, separate bound. Two problems otherwise:
 *  1. Priority callers were exempt from *every* depth check, so during a store
 *     stall the queue grew without limit — the very leak MAX_QUEUE exists to
 *     prevent, now on the path that also holds a live order request open.
 *  2. Depth was measured across both lanes, so a burst of order submits shed
 *     storefront callers even though the storefront lane was empty.
 * Order submits are far rarer than cart opens, so this cap is generous enough
 * that it is only ever reached in a genuine outage.
 */
const MAX_PRIORITY_QUEUE = 1024;
/** A queued caller never waits longer than this before shedding. */
const QUEUE_WAIT_MS = 1500;

let active = 0;
/** Separate lanes: priority drains first, and each is bounded on its own. */
const pWaiters: (() => void)[] = [];
const nWaiters: (() => void)[] = [];

class Shed extends Error {}

/**
 * Trusted internal callers (order submission) get a priority lane: they are
 * shed only in a genuine outage and wait longer, because for them "unknown"
 * is not a soft fallback — it rejects a real, paid-intent order.
 */
const PRIORITY_WAIT_MS = 8000;

async function acquire(priority = false): Promise<void> {
  if (active < GLOBAL_CONCURRENCY) {
    active++;
    return;
  }
  const queue = priority ? pWaiters : nWaiters;
  if (queue.length >= (priority ? MAX_PRIORITY_QUEUE : MAX_QUEUE)) throw new Shed();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const i = queue.indexOf(grant);
      if (i >= 0) queue.splice(i, 1);
      reject(new Shed());
    }, priority ? PRIORITY_WAIT_MS : QUEUE_WAIT_MS);
    // The permit is handed over directly (see `release`), so the woken caller
    // must NOT increment `active` itself — doing so after an `await` opened a
    // window where a fresh caller saw `active < GLOBAL_CONCURRENCY` and the
    // gate briefly admitted more than 16 upstream sockets.
    function grant() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    }
    queue.push(grant);
  });
}


function release() {
  const next = pWaiters.shift() ?? nWaiters.shift();
  // Transfer the permit rather than free-then-reacquire; `active` stays put.
  if (next) next();
  else active--;
}



const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<{ value: Cached["value"]; shed: boolean }>>();

const keyOf = (l: RepriceLineInput) => `${l.productId}:${l.variationId ?? 0}`;

/**
 * Stale-while-revalidate window. With a hard 60s TTL every hot product id
 * expires for *all* concurrent visitors at the same instant, so the second
 * after expiry is a synchronised stampede straight through the global gate.
 * Inside the grace window the stale value is served immediately and a single
 * refresh runs behind it.
 */
const STALE_GRACE_MS = 120_000;

function readCache(key: string): Cached["value"] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) return undefined;
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

/** Expired but still inside the grace window — usable while we refresh. */
function readStale(key: string): Cached["value"] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  const age = Date.now() - hit.at;
  if (age <= TTL_MS) return hit.value;
  if (age > TTL_MS + STALE_GRACE_MS) {
    cache.delete(key);
    return undefined;
  }
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

/** Result used when we deliberately do not call upstream (shed / over budget). */
const UNKNOWN: Cached["value"] = {
  price: null,
  regularPrice: null,
  inStock: true,
  stockQty: null,
  gone: false,
};

/** A fetch outcome that also says whether upstream was actually reached. */
type Outcome = { value: Cached["value"]; shed: boolean };

async function fetchOne(l: RepriceLineInput, priority = false): Promise<Outcome> {
  try {
    await acquire(priority);
  } catch {
    // Load shed: never queue past the admission limit. The caller keeps its
    // own snapshot, exactly like an upstream blip. Flagged as `shed` so it is
    // neither negative-cached nor handed to a trusted caller as a real answer.
    return { value: UNKNOWN, shed: true };
  }


  try {
    return { value: await fetchOneInner(l), shed: false };
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


/**
 * Short negative cache for upstream blips. Blips were deliberately never
 * cached so they'd be retried — but during a real store outage that turns
 * every single request into a fresh upstream attempt, which is precisely the
 * moment the store can least afford it. A few seconds of damping keeps the
 * retry behaviour while cutting outage fan-out by orders of magnitude.
 */
const BLIP_TTL_MS = 5_000;
const BLIP_MAX = 2000;
const blips = new Map<string, number>();

function blipped(key: string): boolean {
  const until = blips.get(key);
  if (until === undefined) return false;
  if (Date.now() > until) {
    blips.delete(key);
    return false;
  }
  return true;
}

function markBlip(key: string) {
  blips.set(key, Date.now() + BLIP_TTL_MS);
  while (blips.size > BLIP_MAX) {
    const oldest = blips.keys().next().value;
    if (oldest === undefined) break;
    blips.delete(oldest);
  }
}

/**
 * Per-key single flight, split by lane.
 *
 * A priority caller must not simply join a storefront in-flight request: that
 * request is queued behind the short storefront deadline, so the trusted call
 * inherits a shed it never asked for. It gets its own coalescing map instead,
 * so order submits still collapse to one upstream request per key among
 * themselves — the earlier "retry once outside the single-flight" escape hatch
 * amplified a burst of submits for the same product into N upstream calls and
 * then threw the successful answer away without caching it.
 */
function refresh(key: string, l: RepriceLineInput, priority = false): Promise<Outcome> {
  const map = priority ? inFlightP : inFlight;
  const running = map.get(key);
  if (running) return running;
  const p = fetchOne(l, priority)
    .then((out) => {
      // A shed result never touched upstream: caching it as a "blip" would
      // poison the key for every caller for 5s purely because the queue was
      // momentarily deep.
      if (out.shed) return out;
      if (out.value.price !== null || out.value.gone) writeCache(key, out.value);
      else markBlip(key);
      return out;
    })
    .finally(() => map.delete(key));
  map.set(key, p);
  return p;
}

async function load(key: string, l: RepriceLineInput, priority = false): Promise<Cached["value"]> {
  const fresh = readCache(key);
  if (fresh) return fresh;

  // Stale-while-revalidate is a *presentation* affordance. Pricing a real
  // order off a value up to TTL+grace (3 min) old is a money-correctness bug,
  // so a trusted caller never takes the stale shortcut — it waits for the
  // authoritative answer and only falls back if upstream cannot supply one.
  if (!priority) {
    const stale = readStale(key);
    if (stale) {
      // Serve stale instantly, refresh once behind it. Without this, every hot
      // id expires for all concurrent visitors on the same tick.
      void refresh(key, l, false).catch(() => {});
      return stale;
    }
    // The blip damper is a presentation-path optimisation only.
    if (blipped(key)) return UNKNOWN;
  }

  const out = await refresh(key, l, priority);
  if (out.shed && priority) {
    // Genuine outage-level shed on the priority lane: fall back to a stale
    // value if one exists rather than rejecting a paid-intent order.
    return readStale(key) ?? out.value;
  }
  return out.value;
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
    // One partition pass, one cache probe per id (the previous two `filter`
    // passes probed — and LRU-touched — every id twice).
    const cachedEntries: typeof entries = [];
    const freshEntries: typeof entries = [];
    for (const e of entries) (isCached(e[1]) ? cachedEntries : freshEntries).push(e);
    const allowed = enumAllowance(client, freshEntries.length);
    entries =
      allowed >= freshEntries.length
        ? entries
        : [...cachedEntries, ...freshEntries.slice(0, allowed)];
  }

  // No client id = trusted internal caller (order submission) => priority lane.
  const priority = !client;
  const results = new Map<string, Cached["value"]>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const idx = cursor++;
      const [key, line] = entries[idx];
      results.set(key, await load(key, line, priority));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));

  return lines.map((l) => {
    const v = results.get(keyOf(l)) ?? UNKNOWN;
    return { productId: l.productId, variationId: l.variationId ?? null, ...v };
  });
}

