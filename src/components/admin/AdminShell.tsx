/**
 * Admin shell — light sidebar + slim topbar + airy main area.
 * Mirrors the Nori marketplace admin visual language.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Menu,
  X as CloseIcon,
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  RotateCcw,
  Star,
  Tag,
  LogOut,
  Search,
  Bell,
  Plus,
  ChevronsUpDown,
  ChevronRight,
  BarChart3,
  FolderTree,
  Boxes,
  UserCircle,
  Megaphone,
  Image as ImageIcon,
  FileText,
  Truck,
  CreditCard,
  Settings,
  Shield,
  Store as StoreIcon,
  Sparkles,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type NavChild = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};
type NavGroup = { label: string; items: NavChild[] };

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
      { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Orders", url: "/admin/orders", icon: ShoppingBag },
      { title: "Backfill", url: "/admin/backfill", icon: RotateCcw },
      { title: "Returns", url: "/admin/returns", icon: RotateCcw },
      { title: "Coupons", url: "/admin/coupons", icon: Tag },
      { title: "Reviews", url: "/admin/reviews", icon: Star },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Security", url: "/admin/security", icon: Shield },
      { title: "Store settings", url: "/admin/settings", icon: Settings },
    ],
  },

];

export function AdminShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-muted/30">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 md:static md:w-[248px] md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition hover:bg-muted/50"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-foreground text-[12px] font-bold text-background">
              Z
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-semibold">Zonash</div>
              <div className="text-[10px] text-muted-foreground">
                Admin workspace
              </div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <nav
          className="flex-1 overflow-y-auto px-2 pb-4"
          onClick={() => setMobileNavOpen(false)}
        >
          {navGroups.map((group) => {
            const hasActive = group.items.some((i) =>
              i.url === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(i.url),
            );
            return (
              <NavSection
                key={group.label}
                group={group}
                pathname={pathname}
                defaultOpen={hasActive}
              />
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold uppercase text-background">
              {email.slice(0, 1) || "S"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12px] font-semibold">
                {email || "Staff"}
              </div>
              <div className="text-[10px] capitalize text-muted-foreground">
                Admin
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur md:gap-3 md:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search…"
              className="h-9 w-full rounded-md border border-border bg-muted/40 pl-8 pr-3 text-[13px] outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <button
            type="button"
            className="hidden h-9 w-9 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground md:grid"
          >
            <Bell className="h-4 w-4" />
          </button>
          <Link
            to="/admin/orders"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-semibold text-background transition hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" />{" "}
            <span className="hidden md:inline">New</span>
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-3 py-4 md:px-8 md:py-8">
            {(title || subtitle || action) && (
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:mb-6 md:gap-4">
                <div className="min-w-0">
                  {title && (
                    <h1 className="truncate text-[18px] font-semibold tracking-tight md:text-[22px]">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="mt-0.5 text-[12px] text-muted-foreground md:text-[13px]">
                      {subtitle}
                    </p>
                  )}
                </div>
                {action}
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavSection({
  group,
  pathname,
  defaultOpen,
}: {
  group: NavGroup;
  pathname: string;
  defaultOpen: boolean;
}) {
  void defaultOpen;
  const open = true;

  return (
    <div className="mt-2">
      <div className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{group.label}</span>
      </div>
      {open && (

        <ul className="mt-1 space-y-0.5">
          {group.items.map((item) => {
            const isParentIndex = item.url === "/admin";
            const active = isParentIndex
              ? pathname === item.url
              : pathname.startsWith(item.url);
            const Icon = item.icon;
            return (
              <li key={item.url}>
                <Link
                  to={item.url}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                    active
                      ? "bg-foreground/[0.06] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span>{item.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
