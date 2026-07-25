import { useCallback, useEffect, useRef, useState } from "react";
import { suggestProducts, type ProductSuggestion } from "@/lib/woo.functions";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const CACHE_MAX = 30;
/** Suggestions for a term stay valid for a couple of minutes. */
const CACHE_TTL_MS = 120_000;

type Entry = { items: ProductSuggestion[]; at: number };

/** Module-level cache — survives panel open/close and remounts within a session. */
const cache = new Map<string, Entry>();

function readCache(key: string): ProductSuggestion[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU position.
  cache.delete(key);
  cache.set(key, hit);
  return hit.items;
}

function writeCache(key: string, items: ProductSuggestion[]) {
  cache.set(key, { items, at: Date.now() });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export type SuggestState = {
  items: ProductSuggestion[];
  loading: boolean;
  error: string | null;
  /** True once a non-cached query for the current term has settled. */
  settled: boolean;
};

const IDLE: SuggestState = { items: [], loading: false, error: null, settled: false };

/**
 * Debounced, race-safe product typeahead.
 *
 * - 300ms debounce, in-flight request aborted on every new keystroke.
 * - A monotonic sequence guard means a slow older response can never overwrite
 *   the state produced by a newer one.
 * - Cache hits render synchronously with no network request at all.
 */
export function useSearchSuggest(term: string, enabled: boolean, limit = 6): SuggestState {
  const [state, setState] = useState<SuggestState>(IDLE);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    seqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  useEffect(() => {
    const q = term.trim();
    if (!enabled || q.length < MIN_CHARS) {
      reset();
      return;
    }

    const key = q.toLowerCase();
    const cached = readCache(key);
    if (cached) {
      seqRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setState({ items: cached, loading: false, error: null, settled: true });
      return;
    }

    const seq = ++seqRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      suggestProducts({ data: { q, limit: 6 }, signal: controller.signal })
        .then((res) => {
          if (seq !== seqRef.current) return; // stale response — drop it
          if (!res.error) writeCache(key, res.items);
          setState({ items: res.items, loading: false, error: res.error, settled: true });
        })
        .catch((err: unknown) => {
          if (seq !== seqRef.current || controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setState({
            items: [],
            loading: false,
            error: "Search is temporarily unavailable.",
            settled: true,
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [term, enabled, reset]);

  // Abort anything in flight when the consumer unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  return state;
}

export { MIN_CHARS };
