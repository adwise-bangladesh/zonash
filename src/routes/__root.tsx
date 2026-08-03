import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/lib/cart";
import { CustomerSessionProvider } from "@/lib/customer-session";
import { installBackGestureListener } from "@/lib/nav-transition";
import {
  EMPTY_SITE_IDENTITY,
  FALLBACK_SITE_TAGLINE,
  FALLBACK_SITE_TITLE,
  siteIdentityQueryOptions,
  type SiteIdentity,
} from "@/lib/site-identity";

import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { GpsGate } from "@/components/GpsGate";
import { NotFoundView } from "@/components/NotFoundView";

function NotFoundComponent() {
  return <NotFoundView />;
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <NotFoundView
      variant="error"
      description={
        error?.message ||
        "We hit a snag loading this page. You can try again or head back home."
      }
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Warm the WordPress site logo once per SSR render so the header paints the
  // real brand mark with no client round-trip. Never blocks: the server layer
  // is cached and any failure falls back to the built-in wordmark.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(siteLogoQueryOptions());
    } catch {
      /* branding is non-critical */
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Zonash — Fine Jewelry, Timeless Design" },
      {
        name: "description",
        content:
          "Zonash crafts modern heirloom jewelry — rings, necklaces, earrings and bracelets in gold, diamonds and precious stones. Shop the latest collections.",
      },
      { property: "og:title", content: "Zonash — Fine Jewelry, Timeless Design" },
      {
        property: "og:description",
        content:
          "Zonash crafts modern heirloom jewelry — rings, necklaces, earrings and bracelets in gold, diamonds and precious stones. Shop the latest collections.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zonash — Fine Jewelry, Timeless Design" },
      { name: "twitter:description", content: "Zonash crafts modern heirloom jewelry — rings, necklaces, earrings and bracelets in gold, diamonds and precious stones. Shop the latest collections." },
      // No og:image/twitter:image here: the root default was a stale Lovable
      // preview screenshot that overrode every page's real cover. Leaf routes
      // supply their own product/category image; pages without one fall back
      // to the hosting-generated preview.

    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Woo product data + images travel through the connector gateway; warming
      // the TLS handshake here shaves ~150–300ms off first image byte.
      { rel: "preconnect", href: "https://connector-gateway.lovable.dev", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://i0.wp.com" },
      { rel: "dns-prefetch", href: "https://i1.wp.com" },
      { rel: "dns-prefetch", href: "https://i2.wp.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Figtree:wght@400;500;600;700&family=Cormorant+Garamond:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600&family=Tiro+Bangla:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // Browser/gesture back must animate as a pop, not a push. `popstate` fires
  // before the router commits, so flipping the direction flag there lands
  // before the view transition takes its snapshot.
  useEffect(() => installBackGestureListener(), []);

  // Persist product / variations queries to localStorage so returning users
  // get instant product-page renders with zero network wait.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import("@/lib/query-persist").then((m) => {
      unsub = m.attachQueryPersistence(queryClient);
    });
    return () => unsub?.();
  }, [queryClient]);


  return (
    <QueryClientProvider client={queryClient}>
      <CustomerSessionProvider>
        <CartProvider>
          <GpsGate />
          <StorefrontFrame>
            <Outlet />
          </StorefrontFrame>
          <MobileBottomNav />
          {/* Position/size/duration live in the Toaster itself so every call
              site gets the identical compact pill. `richColors` is deliberately
              off: it would repaint the pill green/red per type. */}
          <Toaster />

        </CartProvider>
      </CustomerSessionProvider>
    </QueryClientProvider>

  );
}

/**
 * StorefrontFrame — constrains customer-facing pages to a 480px mobile-style
 * column centered on desktop. API routes render full-width.
 */
function StorefrontFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/api")) return <>{children}</>;

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-background shadow-[0_0_40px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}

