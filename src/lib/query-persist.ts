// Client-only persistence for React Query — gives returning users an instant
// product/variations render with no network wait on cold navigation.
//
// Only whitelisted query keys are persisted (product detail + variations).
// Everything else stays in-memory to avoid stale carts, orders, admin state.

import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const PERSIST_KEY = "zonash-rq-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

const PERSISTED_KEYS = new Set(["product", "product-variations"]);

export function attachQueryPersistence(queryClient: QueryClient): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: PERSIST_KEY,
      // Throttle writes so rapid navigation doesn't thrash localStorage.
      throttleTime: 1000,
    });
    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister,
      maxAge: MAX_AGE_MS,
      buster: "v1",
      dehydrateOptions: {
        shouldDehydrateQuery: (q) => {
          if (q.state.status !== "success") return false;
          const root = Array.isArray(q.queryKey) ? q.queryKey[0] : q.queryKey;
          return typeof root === "string" && PERSISTED_KEYS.has(root);
        },
      },
    });
    return unsubscribe;
  } catch {
    return () => {};
  }
}
