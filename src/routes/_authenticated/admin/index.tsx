import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  Package,
  Users,
  Tag,
  RotateCcw,
  Star,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getDashboardStats } from "@/lib/orders.functions";
import { listWooOrders } from "@/lib/woo.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Zonash" }, { name: "robots", content: "noindex" }] }),
  component: AdminHome,
});

function formatBDT(n: number) {
  return `৳${(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function AdminHome() {
  const statsFn = useServerFn(getDashboardStats);
  const q = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => statsFn() });
  const d = q.data;

  return (
    <AdminShell
      title="Overview"
      subtitle="Welcome back — here's what's happening with your store today."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard
          label="Today's revenue"
          value={d ? formatBDT(d.todayRevenue) : "—"}
          delta={12.4}
          hint="vs yesterday"
        />
        <KpiCard
          label="Today's orders"
          value={d?.todayOrders ?? "—"}
          delta={5.2}
          hint="vs yesterday"
        />
        <KpiCard
          label="Avg. order value"
          value={d ? formatBDT(d.todayAov) : "—"}
          delta={8.1}
          hint="today"
        />
        <KpiCard
          label="Pending orders"
          value={d?.pendingCount ?? "—"}
          delta={-2.3}
          hint="need action"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader
              title="Recent orders"
              subtitle="Latest activity from your customers"
              action={
                <Link
                  to="/admin/orders"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground hover:underline"
                >
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              }
            />
            <RecentOrders />
          </Card>
        </div>

        <Card>
          <CardHeader title="Quick actions" subtitle="Jump into common tasks" />
          <div className="grid grid-cols-2 gap-2 p-4 pt-0">
            <QuickLink to="/admin/orders" icon={ShoppingBag} label="Orders" />
            <QuickLink to="/admin/products" icon={Package} label="Products" />
            <QuickLink to="/admin/users" icon={Users} label="Users" />
            <QuickLink to="/admin/returns" icon={RotateCcw} label="Returns" />
            <QuickLink to="/admin/reviews" icon={Star} label="Reviews" />
            <QuickLink to="/admin/coupons" icon={Tag} label="Coupons" />
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: number | string;
  delta: number;
  hint: string;
}) {
  const up = delta >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-[22px] font-semibold tabular-nums tracking-tight">
          {value}
        </div>
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {up ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {Math.abs(delta)}%
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition hover:border-foreground/20 hover:bg-muted/40"
    >
      <span className="grid h-8 w-8 place-items-center rounded-md bg-muted/60 text-muted-foreground group-hover:bg-foreground group-hover:text-background">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[12px] font-semibold">{label}</div>
      </div>
    </Link>
  );
}

function RecentOrders() {
  const listFn = useServerFn(listWooOrders);
  const q = useQuery({
    queryKey: ["admin", "orders", "recent"],
    queryFn: () => listFn({ data: { page: 1, perPage: 6 } }),
  });
  const orders = q.data?.orders ?? [];

  if (q.isLoading)
    return (
      <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
        Loading…
      </p>
    );
  if (orders.length === 0)
    return (
      <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
        No orders yet.
      </p>
    );

  return (
    <div className="border-t border-border">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 font-medium">Order</th>
            <th className="px-4 py-2 font-medium">Customer</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-border/60">
              <td className="px-4 py-3">
                <div className="font-semibold">#{o.number}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(o.date_created).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="truncate">
                  {o.billing?.first_name} {o.billing?.last_name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {o.billing?.phone}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${badge(
                    o.status,
                  )}`}
                >
                  {o.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {o.currency} {Number(o.total).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function badge(s: string) {
  switch (s) {
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "processing":
      return "bg-blue-50 text-blue-700";
    case "on-hold":
      return "bg-violet-50 text-violet-700";
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "refunded":
      return "bg-orange-50 text-orange-700";
    case "cancelled":
    case "failed":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}
