import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type CartItem = {
  productId: number;
  /**
   * WooCommerce variation id for variable products. The parent `productId`
   * is always the real product id, so an order line can be submitted as
   * `{ product_id, variation_id }` exactly the way the REST API expects.
   */
  variationId?: number;
  name: string;
  slug: string;
  sku?: string;
  price: number;
  regularPrice?: number;
  image?: string;
  quantity: number;
};

/**
 * Identity of a bag line. Two variations of the same variable product are
 * distinct lines, so the key is the (product, variation) pair — never the
 * product id alone.
 */
export function lineKey(productId: number, variationId?: number): string {
  return `${productId}:${variationId ?? 0}`;
}
export const itemKey = (i: Pick<CartItem, "productId" | "variationId">) =>
  lineKey(i.productId, i.variationId);

type CartState = {
  items: CartItem[];
  count: number;
  subtotal: number;
  hydrated: boolean;
};

type CartActions = {
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  /** Reconcile a line with server-authoritative pricing. */
  repriceLine: (key: string, price: number, regularPrice?: number) => void;
  /**
   * Apply a whole server reprice in a single state commit. Reconciling a
   * 50-line bag line-by-line costs 50 array copies; this costs one.
   */
  repriceMany: (
    entries: { key: string; price: number; regularPrice?: number }[],
  ) => void;
  clear: () => void;
};


type CartContextValue = CartState & CartActions;

export const MAX_QTY = 99;
/**
 * Hard cap on distinct bag lines. `sanitize` has always trimmed to this on
 * read, so without the same cap on write a bag could grow past it in memory
 * and then silently lose its tail on the next page load.
 */
export const MAX_LINES = 200;
const clampQty = (n: number) => Math.max(0, Math.min(MAX_QTY, Math.floor(n) || 0));


const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * localStorage is user-writable and can hold data from older app versions, so
 * every persisted line is re-validated before it reaches React. Anything that
 * cannot be repaired (missing id/slug) is dropped instead of crashing the page.
 */
function sanitize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CartItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const productId = Number(o.productId);
    const slug = typeof o.slug === "string" ? o.slug : "";
    if (!Number.isFinite(productId) || productId <= 0 || !slug) continue;
    const rawVar = Number(o.variationId);
    const variationId = Number.isFinite(rawVar) && rawVar > 0 ? rawVar : undefined;
    const key = lineKey(productId, variationId);
    if (seen.has(key)) continue;
    const quantity = clampQty(Number(o.quantity));
    if (quantity <= 0) continue;
    seen.add(key);
    const price = num(o.price);
    const regular = num(o.regularPrice);
    out.push({
      productId,
      variationId,
      slug,
      name: typeof o.name === "string" && o.name ? o.name : slug,
      sku: typeof o.sku === "string" ? o.sku : undefined,
      price,
      regularPrice: regular > price ? regular : undefined,
      image: typeof o.image === "string" ? o.image : undefined,
      quantity,
    });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

// Two contexts: state changes frequently, actions are stable refs.
// Consumers that only need to mutate the cart subscribe to actions
// and never re-render on cart-state changes — this is what lets
// `React.memo(QuickCard)` actually skip re-renders.
const CartStateContext = createContext<CartState | null>(null);
const CartActionsContext = createContext<CartActions | null>(null);

// v2: lines carry a real `productId` + optional `variationId`. v1 bags stored
// the variation id (or a synthetic composite) in `productId`, which could not
// be submitted to WooCommerce, so they are discarded rather than migrated.
const STORAGE_KEY = "zonash.cart.v2";
const LEGACY_KEYS = ["zonash.cart.v1"];

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitize(JSON.parse(raw));
        setItems(parsed);
        // Seed the persist guard so hydration alone never triggers a write.
        lastWritten.current = JSON.stringify(parsed);
      } else {
        lastWritten.current = "[]";
      }
      for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    } catch { /* corrupt or unavailable storage — start empty */ }
    setHydrated(true);


    // Keep tabs in sync; without this a checkout in one tab leaves a stale bag
    // in another and the customer can re-submit an already-placed order.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const next = e.newValue ? sanitize(JSON.parse(e.newValue)) : [];
        // Record what storage already holds so adopting another tab's bag
        // does not bounce the identical payload straight back out.
        lastWritten.current = JSON.stringify(next);
        setItems(next);
      } catch { /* ignore malformed cross-tab payload */ }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /**
   * Persisting the bag is a synchronous, main-thread `JSON.stringify` +
   * storage write. Holding down "+" fires one per tap, which janks the row
   * animation on low-end phones, so writes are coalesced to the next idle
   * slot and skipped entirely when the serialised bag is unchanged (the
   * common case right after hydration, which used to write the file back
   * verbatim on every page load).
   */
  const lastWritten = useRef<string | null>(null);
  const pendingWrite = useRef<string | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushWrite = useCallback(() => {
    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    const payload = pendingWrite.current;
    pendingWrite.current = null;
    if (payload === null || payload === lastWritten.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, payload);
      lastWritten.current = payload;
    } catch { /* quota / private mode */ }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload = JSON.stringify(items);
    if (payload === lastWritten.current) return;
    pendingWrite.current = payload;
    if (writeTimer.current !== null) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(flushWrite, 250);
  }, [items, hydrated, flushWrite]);

  // A coalesced write must never be lost to a navigation or tab close.
  useEffect(() => {
    const onHide = () => flushWrite();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushWrite();
    };
  }, [flushWrite]);



  // Stable action refs — functional setState means these never need to
  // close over `items`, so we can freeze them for the provider's lifetime.
  const add = useCallback<CartActions["add"]>((item, qty = 1) => {
    if (!item || !Number.isFinite(item.productId) || item.productId <= 0 || !item.slug) return;
    const variationId =
      Number.isFinite(item.variationId) && (item.variationId ?? 0) > 0 ? item.variationId : undefined;
    const key = lineKey(item.productId, variationId);
    setItems((cur) => {
      if (cur.some((i) => itemKey(i) === key)) {
        return cur.map((i) =>
          itemKey(i) === key ? { ...i, quantity: clampQty(i.quantity + qty) } : i,
        );
      }
      // Refuse silently rather than accepting a line that would be dropped
      // again by `sanitize` on the next load.
      if (cur.length >= MAX_LINES) return cur;
      const price = num(item.price);
      const regular = num(item.regularPrice);

      return [
        ...cur,
        {
          ...item,
          variationId,
          price,
          regularPrice: regular > price ? regular : undefined,
          quantity: clampQty(qty || 1),
        },
      ];
    });
  }, []);


  const remove = useCallback<CartActions["remove"]>((key) => {
    setItems((cur) => cur.filter((i) => itemKey(i) !== key));
  }, []);

  const setQty = useCallback<CartActions["setQty"]>((key, qty) => {
    setItems((cur) => {
      const next = clampQty(qty);
      return next <= 0
        ? cur.filter((i) => itemKey(i) !== key)
        : cur.map((i) => (itemKey(i) === key ? { ...i, quantity: next } : i));
    });
  }, []);

  const repriceLine = useCallback<CartActions["repriceLine"]>((key, price, regularPrice) => {
    const p = num(price);
    const r = num(regularPrice);
    setItems((cur) => {
      let changed = false;
      const next = cur.map((i) => {
        if (itemKey(i) !== key) return i;
        const reg = r > p ? r : undefined;
        if (i.price === p && i.regularPrice === reg) return i;
        changed = true;
        return { ...i, price: p, regularPrice: reg };
      });
      return changed ? next : cur;
    });
  }, []);

  /**
   * Whole-bag reconciliation in one commit. The caller compares against the
   * bag it already holds to decide whether to show its "prices updated"
   * notice, so this stays a pure state write.
   */
  const repriceMany = useCallback<CartActions["repriceMany"]>((entries) => {
    if (entries.length === 0) return;
    const byKey = new Map<string, { price: number; regular?: number }>();
    for (const e of entries) {
      const p = num(e.price);
      if (p <= 0) continue;
      const r = num(e.regularPrice);
      byKey.set(e.key, { price: p, regular: r > p ? r : undefined });
    }
    if (byKey.size === 0) return;
    setItems((cur) => {
      let changed = false;
      const next = cur.map((i) => {
        const hit = byKey.get(itemKey(i));
        if (!hit) return i;
        if (i.price === hit.price && i.regularPrice === hit.regular) return i;
        changed = true;
        return { ...i, price: hit.price, regularPrice: hit.regular };
      });
      return changed ? next : cur;
    });
  }, []);

  const clear = useCallback<CartActions["clear"]>(() => setItems([]), []);

  const actions = useMemo<CartActions>(
    () => ({ add, remove, setQty, repriceLine, repriceMany, clear }),
    [add, remove, setQty, repriceLine, repriceMany, clear],
  );


  const state = useMemo<CartState>(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
      hydrated,
    }),
    [items, hydrated],
  );

  return (
    <CartActionsContext.Provider value={actions}>
      <CartStateContext.Provider value={state}>
        {children}
      </CartStateContext.Provider>
    </CartActionsContext.Provider>
  );
}

/** Actions-only subscription — never re-renders on cart mutations. */
export function useCartActions(): CartActions {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error("useCartActions must be used inside CartProvider");
  return ctx;
}

/** State-only subscription. */
export function useCartState(): CartState {
  const ctx = useContext(CartStateContext);
  if (!ctx) throw new Error("useCartState must be used inside CartProvider");
  return ctx;
}

/**
 * Backwards-compatible combined hook. Note: consumers of this hook still
 * re-render on every cart mutation. Prefer `useCartActions` for components
 * that only need to mutate (buttons, cards), and pass line data as props.
 */
export function useCart(): CartContextValue {
  const state = useCartState();
  const actions = useCartActions();
  // Keep actions ref stable across cart mutations by not spreading them
  // into a fresh object when only `state` changed.
  const cached = useRef<CartContextValue | null>(null);
  if (
    !cached.current ||
    cached.current.items !== state.items ||
    cached.current.hydrated !== state.hydrated ||
    cached.current.add !== actions.add
  ) {
    cached.current = { ...state, ...actions };
  }
  return cached.current;
}
