import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    // Animate every navigation, including browser/gesture back — `popstate`
    // navigations are driven by the router, so a per-link opt-in could never
    // animate them, and back was the most jarring transition in the app.
    // Same-route search-param updates (filter chips, sort) opt OUT individually
    // with `viewTransition={false}`; sliding the whole screen for a filter
    // toggle reads as a page load, which is the opposite of what we want.
    defaultViewTransition: true,
  });


  return routerWithQueryClient(router, queryClient);
};
