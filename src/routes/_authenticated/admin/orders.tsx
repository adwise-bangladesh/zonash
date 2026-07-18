/**
 * Orders — Nori-style admin list with status tabs (with counters),
 * SKU-driven items column, address on the row, and price + delivery totals.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Search, Loader2, Eye, ShoppingBag, X, Truck } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  listWooOrders,
  updateOrderStatus,
  getWooOrder,
  listOrderStatuses,
} from "@/lib/woo.functions";
import {
  getOrderOps,
  updateOrderOps,
  getCustomerStats,
  ratingFromStats,
  type OrderOps,
  type CustomerRating,
} from "@/lib/ops.functions";


export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [{ title: "Orders — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminOrders,
});

// Human-friendly fallback label for unknown/custom status slugs.
function humanize(slug: string) {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const GRID =
  "grid-cols-[100px_minmax(160px,1.2fr)_minmax(160px,1.2fr)_minmax(200px,1.4fr)_150px_130px_170px]";

function money(currency: string, n: number | string) {
  const v = typeof n === "string" ? Number(n) : n;
  return `${currency} ${(v || 0).toFixed(2)}`;
}

function AdminOrders() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWooOrders);
  const updFn = useServerFn(updateOrderStatus);
  const detailFn = useServerFn(getWooOrder);
  const statusesFn = useServerFn(listOrderStatuses);

  const [status, setStatus] = useState<string>("any");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [openId, setOpenId] = useState<number | null>(null);

  const statusesQ = useQuery({
    queryKey: ["admin", "woo-order-statuses"],
    queryFn: () => statusesFn(),
    staleTime: 60_000,
  });
  const wooStatuses = statusesQ.data?.statuses ?? [];
  const totalAll = statusesQ.data?.all ?? 0;
  const countOf = (slug: string) =>
    wooStatuses.find((s) => s.slug === slug)?.count ?? 0;

  // Preferred order for the status tabs; unknown/custom statuses trail after.
  const STATUS_ORDER = [
    "pending",
    "on-hold",
    "confirmed",
    "processing",
    "completed",
    "cancelled",
    "refunded",
    "failed",
  ];
  const tabs = useMemo(() => {
    const rank = (slug: string) => {
      const i = STATUS_ORDER.indexOf(slug);
      return i === -1 ? STATUS_ORDER.length : i;
    };
    const sorted = [...wooStatuses].sort((a, b) => {
      const ra = rank(a.slug);
      const rb = rank(b.slug);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
    return [
      { slug: "any", name: "All", count: totalAll },
      ...sorted.map((s) => ({ slug: s.slug, name: s.name, count: s.count })),
    ];
  }, [wooStatuses, totalAll]);


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
    // Keep the previous grid visible while a new tab/page loads — no blank flashes.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const orders = q.data?.orders ?? [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "woo-orders"] });
    qc.invalidateQueries({ queryKey: ["admin", "woo-order-statuses"] });
  };

  const updM = useMutation({
    mutationFn: (v: { id: number; status: string }) => updFn({ data: v }),
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(`Marked ${humanize(v.status)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pageRevenue = useMemo(
    () => orders.reduce((s, o) => s + Number(o.total || 0), 0),
    [orders],
  );
  const currency = orders[0]?.currency ?? "";

  // Batch-fetch dashboard-owned ops fields + per-customer stats for visible orders.
  const opsFn = useServerFn(getOrderOps);
  const statsFn = useServerFn(getCustomerStats);
  const visibleIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const visibleEmails = useMemo(
    () =>
      Array.from(
        new Set(
          orders
            .map((o) => o.billing?.email?.toLowerCase().trim())
            .filter((e): e is string => !!e && e.includes("@")),
        ),
      ),
    [orders],
  );
  const opsQ = useQuery({
    queryKey: ["admin", "order-ops", visibleIds],
    queryFn: () => opsFn({ data: { ids: visibleIds } }),
    enabled: visibleIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const statsQ = useQuery({
    queryKey: ["admin", "customer-stats", visibleEmails],
    queryFn: () => statsFn({ data: { emails: visibleEmails } }),
    enabled: visibleEmails.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const opsMap = opsQ.data ?? {};
  const statsMap = statsQ.data ?? {};


  return (
    <AdminShell
      title="Orders"
      subtitle="Order lifecycle — live from WooCommerce"
    >
      {/* Dynamic status tabs (built-in + custom WooCommerce statuses) */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto whitespace-nowrap rounded-xl border border-input bg-card p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const active = status === t.slug;
          return (
            <button
              key={t.slug}
              onClick={() => {
                setPage(1);
                setStatus(t.slug);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span>{t.name}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                  active
                    ? "bg-background/20 text-background"
                    : "bg-muted text-foreground"
                }`}
              >
                {statusesQ.isLoading && t.count === 0 ? "…" : t.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-input bg-card p-2">
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
        <div className="text-[11px] text-muted-foreground">
          {q.isLoading
            ? "Loading…"
            : `${orders.length} on this page · Revenue ${money(currency || "৳", pageRevenue)}`}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-input bg-card">
        <div className="min-w-[1200px]">
          <div
            className={`grid ${GRID} gap-3 border-b border-input bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
          >
            <div>Date</div>
            <div>Order / Customer</div>
            <div>Items (SKU)</div>
            <div>Shipping address</div>
            <div className="text-right">Price + Delivery</div>
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
              <p className="text-sm font-medium">
                No orders match these filters
              </p>
            </div>
          )}

          {!q.isLoading &&
            orders.map((o) => {
              const shipping = Number(o.shipping_total || 0);
              const itemsTotal = Number(o.total || 0) - shipping;
              const ship = o.shipping;
              const addrParts = [
                ship?.address_1,
                ship?.address_2,
                ship?.city,
                ship?.state,
                ship?.postcode,
                ship?.country,
              ].filter(Boolean);
              return (
                <div
                  key={o.id}
                  className={`grid ${GRID} items-center gap-3 border-b border-input px-3 py-2.5 last:border-b-0 hover:bg-muted/30`}
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
                    <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {o.billing?.first_name} {o.billing?.last_name}
                      </span>
                      {(() => {
                        const email = o.billing?.email?.toLowerCase().trim();
                        const stat = email ? statsMap[email] : undefined;
                        const rating = ratingFromStats(stat);
                        return (
                          <>
                            <CustomerBadge rating={rating} />
                            {stat && stat.total > 1 && (
                              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground tabular-nums">
                                {stat.total} orders
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {o.billing?.phone || o.billing?.email}
                    </div>
                    {(() => {
                      const ops = opsMap[o.id];
                      if (!ops || (!ops.courier && !ops.tracking_number)) return null;
                      return (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          <Truck className="h-3 w-3" />
                          <span className="truncate">
                            {[ops.courier, ops.tracking_number].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="min-w-0 space-y-0.5 text-[12px]">
                    {(o.line_items ?? []).slice(0, 3).map((li) => (
                      <div key={li.id} className="truncate">
                        <span className="font-mono text-[11px] text-foreground">
                          {li.sku || `#${li.product_id}`}
                        </span>
                        <span className="ml-1 text-muted-foreground">
                          × {li.quantity}
                        </span>
                      </div>
                    ))}
                    {(o.line_items?.length ?? 0) > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{o.line_items.length - 3} more
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                    {addrParts.length ? (
                      <span title={addrParts.join(", ")} className="line-clamp-2">
                        {addrParts.join(", ")}
                      </span>
                    ) : (
                      <span className="italic">No shipping address</span>
                    )}
                  </div>
                  <div className="text-right text-[12px] leading-tight">
                    <div className="tabular-nums text-muted-foreground">
                      {money(o.currency, itemsTotal)}
                      <span className="mx-1">+</span>
                      {money(o.currency, shipping)}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold tabular-nums">
                      = {money(o.currency, o.total)}
                    </div>
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
                        updM.mutate({
                          id: o.id,
                          status: e.target.value,
                        })
                      }
                      className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] outline-none"
                    >
                      {/* Include current status even if it isn't in the reported
                          list (defensive fallback for exotic custom statuses). */}
                      {!wooStatuses.some((s) => s.slug === o.status) && (
                        <option value={o.status}>{humanize(o.status)}</option>
                      )}
                      {wooStatuses.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
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
            Page {page} · {orders.length} orders shown ·{" "}
            {status === "any"
              ? `${totalAll.toLocaleString()} total`
              : `${countOf(status).toLocaleString()} in ${humanize(status)}`}
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
          statuses={wooStatuses}
          onUpdate={(s) => updM.mutate({ id: openId, status: s })}
          initialOps={opsMap[openId]}
          customerStat={(() => {
            const o = orders.find((x) => x.id === openId);
            const e = o?.billing?.email?.toLowerCase().trim();
            return e ? statsMap[e] : undefined;
          })()}
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

function CustomerBadge({ rating }: { rating: CustomerRating }) {
  const cfg: Record<CustomerRating, { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20" },
    average: {
      label: "Average",
      cls: "bg-muted text-foreground/70 ring-1 ring-input",
    },
    perfect: {
      label: "Perfect",
      cls: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20",
    },
    risk: {
      label: "Risk",
      cls: "bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20",
    },
  };
  const { label, cls } = cfg[rating];
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}




function OrderDrawer({
  id,
  onClose,
  detailFn,
  statuses,
  onUpdate,
  initialOps,
  customerStat,
}: {
  id: number;
  onClose: () => void;
  detailFn: (a: { data: { id: number } }) => Promise<any>;
  statuses: { slug: string; name: string; count: number }[];
  onUpdate: (status: string) => void;
  initialOps?: OrderOps;
  customerStat?: import("@/lib/ops.functions").CustomerStat;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "woo-order", id],
    queryFn: () => detailFn({ data: { id } }),
  });
  const o = q.data;

  const opsFn = useServerFn(updateOrderOps);
  const [courier, setCourier] = useState(initialOps?.courier ?? "");
  const [tracking, setTracking] = useState(initialOps?.tracking_number ?? "");
  const [pickup, setPickup] = useState(initialOps?.pickup_slot ?? "");
  const [notes, setNotes] = useState(initialOps?.internal_notes ?? "");
  useEffect(() => {
    setCourier(initialOps?.courier ?? "");
    setTracking(initialOps?.tracking_number ?? "");
    setPickup(initialOps?.pickup_slot ?? "");
    setNotes(initialOps?.internal_notes ?? "");
  }, [initialOps?.wc_order_id, initialOps?.updated_at]);

  const saveOps = useMutation({
    mutationFn: () =>
      opsFn({
        data: {
          wc_order_id: id,
          courier: courier || null,
          tracking_number: tracking || null,
          pickup_slot: pickup || null,
          internal_notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Operations saved");
      qc.invalidateQueries({ queryKey: ["admin", "order-ops"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rating = ratingFromStats(customerStat);


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
            <div className="text-[11px] uppercase text-muted-foreground">
              Order
            </div>
            <div className="text-[16px] font-semibold">
              #{o?.number ?? "…"}
            </div>
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
                  <div className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span>
                      {o.billing.first_name} {o.billing.last_name}
                    </span>
                    <CustomerBadge rating={rating} />
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {o.billing.email}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {o.billing.phone}
                  </div>
                  {customerStat && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {customerStat.total} orders · {customerStat.completed} completed ·{" "}
                      {customerStat.cancelled} cancelled
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Shipping address
                  </div>
                  <div>{o.shipping.address_1}</div>
                  {o.shipping.address_2 && <div>{o.shipping.address_2}</div>}
                  <div className="text-[12px] text-muted-foreground">
                    {[o.shipping.city, o.shipping.state, o.shipping.postcode]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {o.shipping.country}
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
                      className="flex items-start justify-between gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-[12px]">
                          {li.sku || `#${li.product_id}`}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {li.name} × {li.quantity}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono tabular-nums">
                        {money(o.currency, li.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 border-t border-border pt-3 text-[13px]">
                <Row label="Items subtotal">
                  {money(
                    o.currency,
                    Number(o.total) - Number(o.shipping_total || 0),
                  )}
                </Row>
                <Row label="Delivery charge">
                  {money(o.currency, o.shipping_total || 0)}
                </Row>
                <div className="flex items-center justify-between pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {money(o.currency, o.total)}
                  </span>
                </div>
                <div className="pt-1 text-[11px] text-muted-foreground">
                  Payment: {o.payment_method_title || o.payment_method}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                  Change status
                </div>
                <div className="flex flex-wrap gap-2">
                  {statuses.map((s) => (
                    <button
                      key={s.slug}
                      onClick={() => onUpdate(s.slug)}
                      className={`rounded-md border border-input px-2 py-1 text-[12px] hover:bg-muted ${
                        o.status === s.slug ? "bg-foreground text-background" : ""
                      }`}
                    >
                      {s.name}
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{children}</span>
    </div>
  );
}
