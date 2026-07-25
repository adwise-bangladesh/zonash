/**
 * Shared helpers for storefront search terms.
 *
 * Kept out of components so the header, the search page and any future entry
 * point normalise and persist terms identically.
 */

const RECENT_KEY = "zonash.recent-searches";
const RECENT_MAX = 8;
/** Upper bound for a search term — matches the server-side query validators. */
export const TERM_MAX = 120;

export const POPULAR_TERMS = [
  "Rings",
  "Earrings",
  "Necklaces",
  "Bridal",
  "Bangles",
  "Under 2000 Tk",
] as const;

/**
 * Normalises raw input before it ever reaches the URL or localStorage:
 * strips control characters, collapses whitespace and clamps the length.
 */
export function sanitizeTerm(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TERM_MAX);
}

export function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map(sanitizeTerm)
      .filter(Boolean)
      .slice(0, RECENT_MAX);
  } catch {
    // Corrupt JSON, disabled storage or Safari private mode — recents are
    // a convenience, never a hard dependency.
    return [];
  }
}

export function saveRecent(term: string): string[] {
  const t = sanitizeTerm(term);
  if (!t || typeof window === "undefined") return loadRecent();
  const next = [t, ...loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(
    0,
    RECENT_MAX,
  );
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded / storage blocked — silently skip persisting.
  }
  return next;
}

export function clearRecent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
