import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Store, LayoutGrid, LifeBuoy, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

type NavItem = {
  label: string;
  href: "/" | "/products" | "/categories" | "/support" | "/cart";
  icon: typeof Home;
  exact?: boolean;
  cart?: boolean;
};

const items: NavItem[] = [
  { label: "Home", href: "/", icon: Home, exact: true },
  { label: "Shop", href: "/products", icon: Store },
  { label: "Categories", href: "/categories", icon: LayoutGrid },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Cart", href: "/cart", icon: ShoppingBag, cart: true },
];

/**
 * Mobile bottom navigation shown only on small screens. Fixed to the viewport
 * bottom with a safe-area inset so it clears the iOS home indicator.
 */
export function MobileBottomNav() {
  const { count } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hide on admin surfaces — the admin shell has its own chrome.
  if (pathname.startsWith("/admin")) return null;



  return (
    <>
      {/* Spacer so page content isn't hidden behind the fixed nav on mobile */}
      <div className="h-16 md:hidden" aria-hidden />
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around gap-1 border-t border-border bg-background/95 px-2 pt-1.5 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)" }}
      >
        {items.map(({ label, href, icon: Icon, cart, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          const badge = cart ? count : undefined;
          return (
            <Link
              key={label}
              to={href}
              preload="intent"
              aria-label={label}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[3px] py-1 text-[10px] font-medium transition-colors ${
                active ? "text-primary" : "text-foreground/70 hover:text-primary"
              }`}
            >
              <span className="relative grid h-7 w-7 place-items-center">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {typeof badge === "number" && badge > 0 && (
                  <span className="absolute -right-1 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
