/**
 * Admin shell — premium branded sidebar (burgundy) + slim topbar + airy main.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Menu,
  X as CloseIcon,
  LayoutDashboard,
  ShoppingBag,
  Users,
  RotateCcw,
  LogOut,
  Search,
  Bell,
  Plus,
  BarChart3,
  UserCircle,
  Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
  { title: "Orders", url: "/admin/orders", icon: ShoppingBag },
  { title: "Returns", url: "/admin/returns", icon: RotateCcw },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "My profile", url: "/admin/profile", icon: UserCircle },
  { title: "Store settings", url: "/admin/settings", icon: Settings },
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

  const isActive = (url: string) =>
    url === "/admin" ? pathname === "/admin" : pathname.startsWith(url);

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col text-primary-foreground transition-transform duration-200 md:static md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background:
            "linear-gradient(180deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 78%, #000) 100%)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[14px] font-bold shadow-lg ring-1 ring-white/10"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.75))",
              color: "var(--primary)",
            }}
          >

            Z
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[14px] font-semibold tracking-tight">
              Zonash
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/55">
              Admin workspace
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-4 mb-3 h-px bg-white/10" />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.url);
              const Icon = item.icon;
              return (
                <li key={item.url}>
                  <Link
                    to={item.url}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                      active
                        ? "bg-white/15 text-white shadow-sm"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" />
                    )}
                    <Icon className="h-[16px] w-[16px] shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2 ring-1 ring-white/10">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[12px] font-semibold uppercase text-primary">
              {email.slice(0, 1) || "S"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12px] font-semibold text-white">
                {email || "Staff"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-white/55">
                Admin
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="grid h-8 w-8 place-items-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
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
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition hover:bg-primary/90"
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
