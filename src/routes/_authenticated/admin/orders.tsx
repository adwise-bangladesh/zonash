/**
 * Orders — Nori-style admin list with stats strip, filter toolbar and grid list.
 */
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Filter,
  Loader2,
  Eye,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  Home,
  Ban,
  RotateCcw,
  X,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { listWooOrders, updateOrderStatus, getWooOrder } from "@/lib/woo.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({ meta: [{ title: "Orders — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminOrders,
});

const STATUSES = [
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
] as const;
type WooStatus = typeof STATUSES[number];

const STATUS_FILTERS: { value: WooStatus | "any"; label: string; icon: LucideIcon }[] = [
  { value: "any", label: "All", icon: ShoppingBag },
  { value: "pending", label: "Pending", icon: Clock },
  { value: "processing", label: "Processing", icon: Package },
  { value: "on-hold", label: "On hold", icon: Clock },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
  { value: "cancelled", label: "Cancelled", icon: Ban },
  { value: "refunded", label: "Refunded", icon: RotateCcw },
  { value: "failed", label: "Failed", icon: Ban },
];

const GRID =
  "grid-cols-[100px_minmax(150px,1.4fr)_minmax(130px,1fr)_110px_130px_170px]";

function AdminOrders() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWooOrders);
  const updFn = useServerFn(updateOrderStatus);
  const detailFn = useServerFn(getWooOrder);

  const [status, setStatus] = useState<WooStatus | "any">("any");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [openId, setOpenId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["admin", "woo-orders", status, search, page, pageSize],
    queryFn: () =>
      listFn({
        data: {
          status: status === "any" ? undefined : status,
          search: search || undefined,
          page,
          perPage: pageSize,
        },
      }),
  });

  const orders = q.data?.orders ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "woo-orders"] });

  const updM = useMutation({
    mutationFn: (v: { id: number; status: WooStatus }) => updFn({ data: v }),
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(`Marked ${v.status.replace(/-/g, " ")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const s = {
      total: orders.length,
      pending: 0,
      processing: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
    };
    for (const o of orders) {
      if (o.status === "pending" || o.status === "on-hold") s.pending++;
      else if (o.status === "processing") s.processing++;
      else if (o.status === "completed") {
        s.completed++;
        s.revenue += Number(o.total);
      } else if (o.status === "cancelled" || o.status === "failed" || o.status === "refunded")
        s.cancelled++;
    }
    return s;
  }, [orders]);

  return (
    <AdminShell
      title="Orders"
      subtitle="Order lifecycle — live from WooCommerce"
    >
      <StatsStrip stats={stats} loading={q.isLoading} />

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-input bg-card p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search order #, name, phone, email…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-[13px] outline-none focus:border-ring"
          />
        </div>
        <ToolbarSelect
          icon={<Filter className="h-3.5 w-3.5" />}
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v as WooStatus | "any");
          }}
          options={STATUS_FILTERS.map((s) => ({ value: s.value, label: s.label }))}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-input bg-card">
        <div className="min-w-[900px]">
          <div
            className={`grid ${GRID} gap-3 border-b border-input bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
          >
            <div>Date</div>
            <div>Order / Customer</div>
            <div>Items</div>
            <div className="text-right">Total</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>

          {q.isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {!q.isLoading && orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No orders match these filters</p>
            </div>
          )}

          {!q.isLoading &&
            orders.map((o) => {
              const itemCount = (o.line_items ?? []).reduce(
                (s, i) => s + (i.quantity || 0),
                0,
              );
              return (
                <div
                  key={o.id}
                  className={`grid ${GRID} items-center gap-3 border-b border-input px-3 py-2 last:border-b-0 hover:bg-muted/30`}
                >
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {new Date(o.date_created).toLocaleDateString()}
                    <div className="text-[10px]">
                      {new Date(o.date_created).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <button
                      onClick={() => setOpenId(o.id)}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      #{o.number}
                    </button>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {o.billing?.first_name} {o.billing?.last_name} ·{" "}
                      {o.billing?.phone || o.billing?.email}
                    </div>
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {itemCount} item{itemCount === 1 ? "" : "s"}
                    <div className="truncate text-[10px]">
                      {o.line_items?.[0]?.name ?? ""}
                      {(o.line_items?.length ?? 0) > 1
                        ? ` +${o.line_items.length - 1}`
                        : ""}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {o.currency} {Number(o.total).toFixed(2)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={o.status} />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {o.payment_method_title || o.payment_method || "—"}
                    </span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <select
                      value={o.status}
                      onChange={(e) =>
                        updM.mutate({ id: o.id, status: e.target.value as WooStatus })
                      }
                      className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] outline-none"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setOpenId(o.id)}
                      title="View"
                      className="rounded-md border border-input p-1.5 hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {!q.isLoading && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} · {orders.length} orders shown
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-input bg-card px-2 py-1 hover:bg-muted disabled:opacity-30"
            >
              Prev
            </button>
            <span className="px-2 tabular-nums">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={orders.length < pageSize}
              className="rounded-md border border-input bg-card px-2 py-1 hover:bg-muted disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {openId !== null && (
        <OrderDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          detailFn={detailFn}
          onUpdate={(status) =>
            updM.mutate({ id: openId, status: status as WooStatus })
          }
        />
      )}
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700",
    "on-hold": "bg-amber-500/10 text-amber-700",
    processing: "bg-blue-500/10 text-blue-700",
    completed: "bg-emerald-500/10 text-emerald-700",
    refunded: "bg-orange-500/10 text-orange-700",
    cancelled: "bg-muted text-muted-foreground line-through",
    failed: "bg-rose-500/10 text-rose-700",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${map[status] ?? "bg-muted"}`}
    >
      {status.replace(/-/g, " ")}
    </span>
  );
}

function ToolbarSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background pl-2 pr-1 text-[12px]">
      <span className="text-muted-foreground">{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full bg-transparent pr-1 text-[12px] outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatsStrip({
  stats,
  loading,
}: {
  stats: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    cancelled: number;
    revenue: number;
  };
  loading: boolean;
}) {
  const items: Array<{ label: string; value: string | number; icon: LucideIcon }> = [
    { label: "Orders", value: stats.total, icon: ShoppingBag },
    { label: "Pending", value: stats.pending, icon: Clock },
    { label: "Processing", value: stats.processing, icon: Package },
    { label: "Completed", value: stats.completed, icon: Home },
    { label: "Cancelled", value: stats.cancelled, icon: Ban },
    {
      label: "Revenue",
      value: `৳${stats.revenue.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`,
      icon: Receipt,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-2 rounded-xl border border-input bg-card p-3"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground">
            <it.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {it.label}
            </div>
            <div className="truncate text-[15px] font-semibold tabular-nums">
              {loading ? "—" : it.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderDrawer({
  id,
  onClose,
  detailFn,
  onUpdate,
}: {
  id: number;
  onClose: () => void;
  detailFn: (a: { data: { id: number } }) => Promise<any>;
  onUpdate: (status: string) => void;
}) {
  const q = useQuery({
    queryKey: ["admin", "woo-order", id],
    queryFn: () => detailFn({ data: { id } }),
  });
  const o = q.data;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-foreground/40 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Order</div>
            <div className="text-[16px] font-semibold">#{o?.number ?? "…"}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {q.isLoading || !o ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Customer
                  </div>
                  <div className="font-medium">
                    {o.billing.first_name} {o.billing.last_name}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {o.billing.email}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {o.billing.phone}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Shipping
                  </div>
                  <div>{o.shipping.address_1}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {o.shipping.city}, {o.shipping.country}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                  Items
                </div>
                <div className="rounded-md border border-border">
                  {o.line_items.map((li: any) => (
                    <div
                      key={li.id}
                      className="flex justify-between border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <span className="truncate">
                        {li.name} × {li.quantity}
                      </span>
                      <span className="font-mono tabular-nums">
                        {o.currency} {Number(li.total).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Payment
                  </div>
                  <div>{o.payment_method_title}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Total
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {o.currency} {Number(o.total).toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                  Change status
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => onUpdate(s)}
                      className={`rounded-md border border-input px-2 py-1 text-[12px] capitalize hover:bg-muted ${
                        o.status === s ? "bg-foreground text-background" : ""
                      }`}
                    >
                      {s.replace(/-/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
