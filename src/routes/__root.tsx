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
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { GpsGate } from "@/components/GpsGate";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e4166066-98dc-4480-8947-60ed7107caa3/id-preview-e28e3bf3--c1019e6e-9ce4-4035-a58d-b94909a34398.lovable.app-1784372534496.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e4166066-98dc-4480-8947-60ed7107caa3/id-preview-e28e3bf3--c1019e6e-9ce4-4035-a58d-b94909a34398.lovable.app-1784372534496.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
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
          <Toaster richColors position="top-right" />
        </CartProvider>
      </CustomerSessionProvider>
    </QueryClientProvider>

  );
}

/**
 * StorefrontFrame — constrains customer-facing pages to a 480px mobile-style
 * column centered on desktop. Admin, auth, and API routes render full-width.
 */
function StorefrontFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unframed =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api");
  if (unframed) return <>{children}</>;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-background shadow-[0_0_40px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}

