import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type CartItem = {
  productId: number;
  name: string;
  slug: string;
  sku?: string;
  price: number;
  regularPrice?: number;
  image?: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  count: number;
  subtotal: number;
  hydrated: boolean;
};

type CartActions = {
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
};

type CartContextValue = CartState & CartActions;

export const MAX_QTY = 99;
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
  const seen = new Set<number>();
  const out: CartItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const productId = Number(o.productId);
    const slug = typeof o.slug === "string" ? o.slug : "";
    if (!Number.isFinite(productId) || productId <= 0 || !slug || seen.has(productId)) continue;
    const quantity = clampQty(Number(o.quantity));
    if (quantity <= 0) continue;
    seen.add(productId);
    const price = num(o.price);
    const regular = num(o.regularPrice);
    out.push({
      productId,
      slug,
      name: typeof o.name === "string" && o.name ? o.name : slug,
      sku: typeof o.sku === "string" ? o.sku : undefined,
      price,
      regularPrice: regular > price ? regular : undefined,
      image: typeof o.image === "string" ? o.image : undefined,
      quantity,
    });
    if (out.length >= 200) break;
  }
  return out;
}

// Two contexts: state changes frequently, actions are stable refs.
// Consumers that only need to mutate the cart subscribe to actions
// and never re-render on cart-state changes — this is what lets
// `React.memo(QuickCard)` actually skip re-renders.
const CartStateContext = createContext<CartState | null>(null);
const CartActionsContext = createContext<CartActions | null>(null);

const STORAGE_KEY = "zonash.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(sanitize(JSON.parse(raw)));
    } catch { /* corrupt or unavailable storage — start empty */ }
    setHydrated(true);

    // Keep tabs in sync; without this a checkout in one tab leaves a stale bag
    // in another and the customer can re-submit an already-placed order.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        setItems(e.newValue ? sanitize(JSON.parse(e.newValue)) : []);
      } catch { /* ignore malformed cross-tab payload */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* quota / private mode */ }
  }, [items, hydrated]);


  // Stable action refs — functional setState means these never need to
  // close over `items`, so we can freeze them for the provider's lifetime.
  const add = useCallback<CartActions["add"]>((item, qty = 1) => {
    setItems((cur) => {
      const found = cur.find((i) => i.productId === item.productId);
      if (found) {
        return cur.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: clampQty(i.quantity + qty) }
            : i,
        );
      }
      return [...cur, { ...item, quantity: clampQty(qty || 1) }];
    });
  }, []);

  const remove = useCallback<CartActions["remove"]>((id) => {
    setItems((cur) => cur.filter((i) => i.productId !== id));
  }, []);

  const setQty = useCallback<CartActions["setQty"]>((id, qty) => {
    setItems((cur) => {
      const next = clampQty(qty);
      return next <= 0
        ? cur.filter((i) => i.productId !== id)
        : cur.map((i) => (i.productId === id ? { ...i, quantity: next } : i));
    });
  }, []);

  const clear = useCallback<CartActions["clear"]>(() => setItems([]), []);

  const actions = useMemo<CartActions>(
    () => ({ add, remove, setQty, clear }),
    [add, remove, setQty, clear],
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
