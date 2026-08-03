/**
 * Recently viewed products (client-only, localStorage).
 *
 * Used to float products the shopper already looked at to the top of the
 * storefront grids. Never read during SSR — the server has no idea what this
 * device viewed, so grids render the plain availability order first and the
 * recency boost is applied after hydration.
 */

const KEY = "zonash:recently-viewed";
const LIMIT = 24;

export function readRecentlyViewed(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is number => typeof x === "number").slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function pushRecentlyViewed(id: number | undefined | null): void {
  if (typeof window === "undefined" || typeof id !== "number" || !Number.isFinite(id)) return;
  try {
    const next = [id, ...readRecentlyViewed().filter((x) => x !== id)].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — recency is a nice-to-have, never a blocker.
  }
}
