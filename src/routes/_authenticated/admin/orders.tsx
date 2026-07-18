/**
 * Orders — Nori-style admin list with status tabs (with counters),
 * SKU-driven items column, address on the row, and price + delivery totals.
 */
import { useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z as zSearch } from "zod";

import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  Search, Loader2, ShoppingBag, X, Truck, ChevronDown, ChevronRight,
  User, Package, Receipt, Clock, Plus, Trash2, Save, ShieldCheck, Printer, Send,
} from "lucide-react";

import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  listWooOrders,
  updateOrderStatus,
  getWooOrder,
  listOrderStatuses,
  listCustomerOrders,
  updateWooOrder,
  listProducts,
  listProductVariations,
  listShippingMethods,
  listOrderNotes,
  addOrderNote,
  sendCustomerMessage,
  type WooOrderNote,
} from "@/lib/woo.functions";
import {
  listMessageTemplates,
  type MessageTemplate,
} from "@/lib/templates.functions";

import {
  getOrderOps,
  updateOrderOps,
  getCustomerStats,
  ratingFromStats,
  type OrderOps,
  type CustomerRating,
} from "@/lib/ops.functions";
import { sendOrderToSteadfast, refreshSteadfastStatus, bulkSendOrdersToSteadfast } from "@/lib/steadfast.functions";
import { verifyCustomerPhone } from "@/lib/hoorin.functions";
import { getCustomerHistory, type CustomerHistory } from "@/lib/customer-history.functions";
import { HoorinReportView } from "@/routes/_authenticated/admin/settings";
import type { HoorinReport } from "@/lib/hoorin.server";



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
  "grid-cols-[32px_100px_minmax(160px,1.2fr)_minmax(160px,1.2fr)_minmax(200px,1.4fr)_150px_130px_170px]";


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
  const [insight, setInsight] = useState<{ email: string; phone?: string; name?: string } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | { label: string; done: number; total: number }>(null);

  // Reset selection whenever the visible list changes (page/tab/search).
  useEffect(() => {
    setSelected(new Set());
  }, [status, search, page]);



  const statusesQ = useQuery({
    queryKey: ["admin", "woo-order-statuses"],
    queryFn: () => statusesFn(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
    // Cache for 2 minutes — webhooks push order updates in real-time, so
    // background refetching would only add noise. Users can force-refresh via mutation.
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
  const statsQ = useQuery({
    queryKey: ["admin", "customer-stats", visibleEmails],
    queryFn: () => statsFn({ data: { emails: visibleEmails } }),
    enabled: visibleEmails.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const opsMap = opsQ.data ?? {};
  const statsMap = statsQ.data ?? {};

  // Bulk actions ------------------------------------------------------------
  const sendSfFn = useServerFn(sendOrderToSteadfast);
  const bulkSendSfFn = useServerFn(bulkSendOrdersToSteadfast);


  const selectedOrders = useMemo(
    () => orders.filter((o) => selected.has(o.id)),
    [orders, selected],
  );
  const allVisibleSelected =
    orders.length > 0 && orders.every((o) => selected.has(o.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      for (const o of orders) next.add(o.id);
      return next;
    });
  };
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runBulk<T>(
    label: string,
    ids: number[],
    concurrency: number,
    worker: (id: number) => Promise<T>,
  ) {
    setBulkBusy({ label, done: 0, total: ids.length });
    let done = 0;
    let ok = 0;
    let fail = 0;
    let idx = 0;
    async function run() {
      while (idx < ids.length) {
        const my = idx++;
        try {
          await worker(ids[my]);
          ok++;
        } catch (e) {
          fail++;
          console.error("bulk", label, ids[my], e);
        } finally {
          done++;
          setBulkBusy({ label, done, total: ids.length });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, ids.length) }, run),
    );
    setBulkBusy(null);
    if (fail === 0) toast.success(`${label}: ${ok} done`);
    else toast.error(`${label}: ${ok} done · ${fail} failed`);
    invalidate();
    setSelected(new Set());
  }

  const bulkUpdateStatus = (next: string) => {
    if (!next || selected.size === 0) return;
    void runBulk(
      `Update → ${humanize(next)}`,
      Array.from(selected),
      4,
      (id) => updFn({ data: { id, status: next } }),
    );
  };

  const performBulkSend = async (ids: number[]) => {
    const CHUNK = 500;
    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) batches.push(ids.slice(i, i + CHUNK));

    setBulkBusy({ label: "Send to Courier", done: 0, total: ids.length });
    let success = 0;
    let failed = 0;
    const errorMsgs: string[] = [];
    let done = 0;
    for (const batch of batches) {
      try {
        const r = await bulkSendSfFn({ data: { wc_order_ids: batch } });
        success += r.success;
        failed += r.failed;
        for (const s of r.skipped) errorMsgs.push(`#${s.invoice}: ${s.reason}`);
        for (const f of r.results.filter((x) => x.status !== "success")) {
          errorMsgs.push(`#${f.invoice}: ${f.status}`);
        }
      } catch (e) {
        failed += batch.length;
        errorMsgs.push(e instanceof Error ? e.message : "Batch failed");
      }
      done += batch.length;
      setBulkBusy({ label: "Send to Courier", done, total: ids.length });
    }
    setBulkBusy(null);
    if (failed === 0) toast.success(`Sent ${success} order(s) to courier`);
    else {
      toast.error(
        `Courier: ${success} sent · ${failed} failed${
          errorMsgs.length ? ` — ${errorMsgs.slice(0, 3).join("; ")}${errorMsgs.length > 3 ? "…" : ""}` : ""
        }`,
      );
    }
    invalidate();
    setSelected(new Set());
  };

  const bulkSendSteadfast = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    toast(`Send ${ids.length} order(s) to courier?`, {
      description: "This will dispatch all selected orders via Steadfast.",
      action: { label: "Send", onClick: () => void performBulkSend(ids) },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };


  const bulkPrintLabels = () => {
    if (selectedOrders.length === 0) return;
    const opsList = opsMap;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Popup blocked. Allow popups to print labels.");
      return;
    }
    const esc = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const html = selectedOrders
      .map((o) => {
        const s = o.shipping ?? {};
        const b = o.billing ?? {};
        const name =
          [s.first_name || b.first_name, s.last_name || b.last_name]
            .filter(Boolean)
            .join(" ") || "Customer";
        const addr = [
          s.address_1 || b.address_1,
          s.address_2 || b.address_2,
          s.city || b.city,
          s.state || b.state,
          s.postcode || b.postcode,
        ]
          .filter(Boolean)
          .join(", ");
        const phone = b.phone || "";
        const ops = opsList[o.id];
        const tracking = ops?.tracking_number || "";
        const courier = ops?.courier || "";
        const items = (o.line_items ?? [])
          .map((li) => `${li.quantity}× ${esc(li.sku || li.name)}`)
          .join(", ");
        return `
          <div class="label">
            <div class="row"><div class="brand">ZONASH</div><div class="ord">#${esc(o.number)}</div></div>
            <div class="to">TO:</div>
            <div class="name">${esc(name)}</div>
            <div class="addr">${esc(addr)}</div>
            <div class="phone">📞 ${esc(phone)}</div>
            <div class="row small"><div>${esc(courier)}</div><div class="mono">${esc(tracking)}</div></div>
            <div class="items">${esc(items)}</div>
            <div class="row small"><div>COD</div><div class="mono">${esc(o.currency)} ${Number(o.total || 0).toFixed(2)}</div></div>
          </div>`;
      })
      .join("");
    win.document.write(`<!doctype html><html><head><title>Labels</title>
      <style>
        *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,sans-serif}
        body{margin:0;padding:12px;background:#f6f6f6}
        .label{background:#fff;border:1px solid #000;padding:12px;margin:0 0 8px;page-break-inside:avoid;width:100mm}
        .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
        .brand{font-weight:800;letter-spacing:2px;font-size:14px}
        .ord{font-weight:700;font-size:14px}
        .to{margin-top:8px;font-size:10px;color:#666;letter-spacing:1px}
        .name{font-weight:700;font-size:16px;margin-top:2px}
        .addr{font-size:13px;margin-top:4px;line-height:1.3}
        .phone{font-size:13px;margin-top:4px}
        .small{font-size:11px;margin-top:6px;color:#333}
        .items{font-size:10px;color:#555;margin-top:6px;border-top:1px dashed #ccc;padding-top:6px}
        .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        @media print{body{background:#fff;padding:0}.label{margin:0;border:1px dashed #000}}
      </style></head><body>${html}
      <script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>
      </body></html>`);
    win.document.close();
  };

  const totalCount =
    status === "any" ? totalAll : countOf(status);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));




  return (
    <AdminShell title="">
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

      {/* Toolbar — search + inline bulk actions */}
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

        <div className="flex items-center gap-2">
          {q.isFetching && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
            </span>
          )}
          {selected.size > 0 && (
            <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
              {selected.size} selected
            </span>
          )}
          <select
            defaultValue=""
            disabled={!!bulkBusy || selected.size === 0}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (v) bulkUpdateStatus(v);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-[11px] outline-none disabled:opacity-50"
          >
            <option value="">Update status…</option>
            {wooStatuses.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={bulkSendSteadfast}
            disabled={!!bulkBusy || selected.size === 0}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-2.5 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-40"
          >
            <Truck className="h-3.5 w-3.5" /> Send to Courier
          </button>
          <button
            onClick={bulkPrintLabels}
            disabled={!!bulkBusy || selected.size === 0}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" /> Print labels
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-2 text-[11px] hover:bg-muted"
            >
              Clear
            </button>
          )}
          {bulkBusy && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {bulkBusy.label} · {bulkBusy.done}/{bulkBusy.total}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-input bg-card overflow-hidden">
        {/* Header row — visible on lg+, compact on smaller screens */}
        <div className="hidden lg:grid items-center gap-2 border-b border-input bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground grid-cols-[24px_140px_minmax(220px,1.5fr)_minmax(140px,1fr)_130px_120px_180px]">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAll}
            aria-label="Select all on this page"
            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground"
          />
          <div>Date · Order</div>
          <div>Customer</div>
          <div>Items</div>
          <div>Verification</div>
          <div className="text-right">Total</div>
          <div>Actions</div>
        </div>


        {q.isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="flex items-center gap-3 border-b border-input px-3 py-3"
            >
              <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse shrink-0" />
              <div className="h-3 w-14 rounded bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-64 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-5 w-20 rounded bg-muted animate-pulse" />
              <div className="h-7 w-40 rounded bg-muted animate-pulse" />
            </div>
          ))}

        {!q.isLoading && orders.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              No orders match these filters
            </p>
          </div>
        )}

        {!q.isLoading && (
          <div
            className={`transition-opacity duration-200 ${q.isFetching ? "opacity-60" : "opacity-100"}`}
          >
            {orders.map((o) => {
              const shipping = Number(o.shipping_total || 0);
              const itemsTotal = Number(o.total || 0) - shipping;
              const ship = o.shipping;
              const addrParts = [
                ship?.address_1,
                ship?.address_2,
                ship?.city,
                ship?.state,
                ship?.postcode,
              ].filter(Boolean);
              const isSel = selected.has(o.id);
              const email = o.billing?.email?.toLowerCase().trim();
              const stat = email ? statsMap[email] : undefined;
              const rating = ratingFromStats(stat);
              const totalOrders = stat?.total ?? 0;
              const ops = opsMap[o.id];
              return (
                <OrderRow
                  key={o.id}
                  order={o}
                  isSel={isSel}
                  onToggle={() => toggleOne(o.id)}
                  onOpen={() => setOpenId(o.id)}
                  onOpenCustomer={() => email && setInsight({ email, phone: o.billing?.phone, name: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ") })}
                  onUpdateStatus={(s) => updM.mutate({ id: o.id, status: s })}
                  wooStatuses={wooStatuses}
                  ops={ops}
                  rating={rating}
                  totalOrders={totalOrders}
                  addr={addrParts.join(", ")}
                  itemsTotal={itemsTotal}
                  shipping={shipping}
                  onInvalidate={invalidate}
                />
              );
            })}
          </div>
        )}
      </div>

      {!q.isLoading && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * pageSize + 1}–
            {(page - 1) * pageSize + orders.length} of{" "}
            {totalCount.toLocaleString()}
            {status !== "any" ? ` in ${humanize(status)}` : ""}
          </span>
          <Pagination
            page={page}
            pageCount={pageCount}
            onChange={(p) => setPage(p)}
          />
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

      {insight !== null && (
        <CustomerInsightDrawer
          email={insight.email}
          phone={insight.phone}
          name={insight.name}
          statuses={wooStatuses}
          onUpdateStatus={(id, s) => updM.mutate({ id, status: s })}
          onClose={() => setInsight(null)}
          onOpenOrder={(id) => {
            setInsight(null);
            setOpenId(id);
          }}
        />
      )}




    </AdminShell>
  );
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  const pages = useMemo(() => {
    const out: (number | "…")[] = [];
    const push = (v: number | "…") => out.push(v);
    const add = (v: number) => {
      if (v >= 1 && v <= pageCount) push(v);
    };
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) add(i);
    } else {
      add(1);
      if (page > 4) push("…");
      const start = Math.max(2, page - 1);
      const end = Math.min(pageCount - 1, page + 1);
      for (let i = start; i <= end; i++) add(i);
      if (page < pageCount - 3) push("…");
      add(pageCount);
    }
    return out;
  }, [page, pageCount]);

  const btn =
    "min-w-[28px] h-7 rounded-md border border-input bg-card px-2 text-[11px] hover:bg-muted disabled:opacity-30 tabular-nums";
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className={btn}
      >
        Prev
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`${btn} ${p === page ? "bg-foreground text-background border-foreground" : ""}`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        className={btn}
      >
        Next
      </button>
    </div>
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
  // "New" badge intentionally hidden — not useful signal on its own.
  if (rating === "new") return null;
  const cfg: Record<Exclude<CustomerRating, "new">, { label: string; cls: string }> = {
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


/* ============================================================ ORDER ROW
   Card-style row (no horizontal scroll). Packs date/customer/items/address/
   verification/courier into one wrapping card, with per-row Verify and
   Send-to-Steadfast buttons.
============================================================ */

type WooStatus = { slug: string; name: string; count: number };

type OrderRowProps = {
  order: import("@/lib/woo.server").WooOrder;
  isSel: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenCustomer: () => void;
  onUpdateStatus: (s: string) => void;
  wooStatuses: WooStatus[];
  ops: OrderOps | undefined;
  rating: CustomerRating;
  totalOrders: number;
  addr: string;
  itemsTotal: number;
  shipping: number;
  onInvalidate: () => void;
};

function OrderRow({
  order: o,
  isSel,
  onToggle,
  onOpen,
  onOpenCustomer,
  onUpdateStatus,
  wooStatuses,
  ops,
  rating,
  totalOrders,
  addr,
  itemsTotal,
  shipping,
  onInvalidate,
}: OrderRowProps) {
  const verifyFn = useServerFn(verifyCustomerPhone);
  const sendFn = useServerFn(sendOrderToSteadfast);
  const [verify, setVerify] = useState<{
    loading: boolean;
    report?: HoorinReport;
    error?: string;
  }>({ loading: false });
  const [sending, setSending] = useState(false);
  
  const [tracking, setTracking] = useState<string | null>(
    ops?.tracking_number ?? null,
  );

  const phone = o.billing?.phone?.trim() || "";
  const hasCourier = !!(tracking || ops?.tracking_number);

  // Auto-load Hoorin verification on mount (once per row / phone).
  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    setVerify({ loading: true });
    verifyFn({ data: { phone } })
      .then((report) => {
        if (!cancelled) setVerify({ loading: false, report });
      })
      .catch((e) => {
        if (!cancelled)
          setVerify({
            loading: false,
            error: e instanceof Error ? e.message : "Verify failed",
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const performSend = async () => {
    setSending(true);
    try {
      const r = await sendFn({ data: { wc_order_id: o.id } });
      setTracking(r.tracking_code);
      toast.success(`Sent to courier · ${r.tracking_code}`);
      onInvalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const doSend = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (hasCourier) {
      toast.info("Already sent to courier");
      return;
    }
    toast(`Send order #${o.number} to courier?`, {
      action: { label: "Send", onClick: () => void performSend() },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };


  const overall = verify.report?.overall;
  const ratio = overall ? Number(overall.success_ratio ?? 0) : null;
  const ratioCls =
    ratio === null
      ? "bg-muted text-muted-foreground"
      : ratio >= 80
        ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
        : ratio >= 50
          ? "bg-amber-500/10 text-amber-700 ring-amber-500/20"
          : "bg-rose-500/10 text-rose-700 ring-rose-500/20";

  // Status colors — reuse from StatusBadge map so the action-bar select is color-coded.
  const statusColors: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    "on-hold": "bg-amber-500/10 text-amber-700 border-amber-500/30",
    confirmed: "bg-sky-500/10 text-sky-700 border-sky-500/30",
    processing: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    refunded: "bg-orange-500/10 text-orange-700 border-orange-500/30",
    cancelled: "bg-muted text-muted-foreground border-input",
    failed: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  };
  const statusCls = statusColors[o.status] ?? "bg-muted text-foreground border-input";

  const lineItems = o.line_items ?? [];
  const shownSkus = lineItems.slice(0, 2);
  const moreCount = Math.max(0, lineItems.length - 2);
  const allSkusTooltip = lineItems
    .map((li) => `${li.quantity}× ${li.sku || li.name}`)
    .join("\n");

  const custName =
    [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ") ||
    "—";

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`grid lg:grid-cols-[24px_140px_minmax(220px,1.5fr)_minmax(140px,1fr)_130px_120px_180px] grid-cols-1 items-start gap-2 border-b border-input px-3 py-2.5 last:border-b-0 cursor-pointer transition-colors ${
        isSel ? "bg-foreground/[0.04]" : "hover:bg-muted/40"
      }`}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
        <input
          type="checkbox"
          checked={isSel}
          onChange={onToggle}
          aria-label={`Select order ${o.number}`}
          className="h-3.5 w-3.5 cursor-pointer accent-foreground"
        />
      </div>

      {/* Date + Order # */}
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold tabular-nums">#{o.number}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {new Date(o.date_created).toLocaleDateString()}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {new Date(o.date_created).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {/* Customer: name, phone, address (clamped w/ tooltip) */}
      <div className="min-w-0 leading-snug">
        <div className="truncate text-[13px] font-medium">{custName}</div>
        <div className="truncate text-[11px] text-muted-foreground tabular-nums">
          {phone || o.billing?.email || "—"}
        </div>
        {addr ? (
          <div
            title={addr}
            className="text-[11px] text-muted-foreground line-clamp-2"
          >
            {addr}
          </div>
        ) : (
          <div className="text-[11px] italic text-muted-foreground">
            No shipping address
          </div>
        )}
      </div>


      {/* Items — 2 SKUs then "+N more" with tooltip */}
      <div className="min-w-0 space-y-0.5 text-[12px]">
        {shownSkus.map((li) => (
          <div key={li.id} className="truncate" title={li.name}>
            <span className="font-mono text-[11px]">
              {li.sku || `#${li.product_id}`}
            </span>
            <span className="ml-1 text-muted-foreground">× {li.quantity}</span>
          </div>
        ))}
        {moreCount > 0 && (
          <div
            title={allSkusTooltip}
            className="inline-block cursor-help rounded bg-muted px-1.5 py-[1px] text-[10px] font-medium text-foreground/70"
          >
            + {moreCount} more sku{moreCount === 1 ? "" : "s"}
          </div>
        )}
        {lineItems.length === 0 && (
          <div className="text-[10px] italic text-muted-foreground">
            No items
          </div>
        )}
      </div>

      {/* Verification — auto-loaded; click pill for full report */}
      <div className="min-w-0 text-[11px] leading-tight" onClick={(e) => e.stopPropagation()}>
        {!phone ? (
          <span className="italic text-muted-foreground">No phone</span>
        ) : verify.loading ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking…
          </span>
        ) : verify.error ? (
          <span
            title={verify.error}
            className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-700"
          >
            Verify error
          </span>
        ) : overall ? (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCustomer();
              }}
              title="View courier history & Zonash orders"
              className={`inline-block rounded-full px-2 py-[2px] text-[10px] font-semibold tabular-nums ring-1 hover:brightness-95 ${ratioCls}`}
            >
              {ratio}% success
            </button>
            {totalOrders >= 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomer();
                }}
                title="View all orders from this customer"
                className="rounded-full bg-foreground/10 px-1.5 py-[1px] text-[10px] font-semibold tabular-nums text-foreground hover:bg-foreground hover:text-background"
              >
                {totalOrders} order{totalOrders === 1 ? "" : "s"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <span className="italic text-muted-foreground">No history</span>
            {totalOrders >= 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomer();
                }}
                title="View all orders from this customer"
                className="rounded-full bg-foreground/10 px-1.5 py-[1px] text-[10px] font-semibold tabular-nums text-foreground hover:bg-foreground hover:text-background"
              >
                {totalOrders} order{totalOrders === 1 ? "" : "s"}
              </button>
            )}
          </div>
        )}


      </div>

      {/* Total */}
      <div className="text-right text-[11px] leading-tight">
        <div className="tabular-nums text-muted-foreground">
          {money(o.currency, itemsTotal)}
          <span className="mx-0.5">+</span>
          {money(o.currency, shipping)}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {money(o.currency, o.total)}
        </div>
      </div>

      {/* Actions — status + conditional courier control */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-stretch justify-center gap-1 min-w-0 self-stretch"
      >
        <select
          value={o.status}
          onChange={(e) => onUpdateStatus(e.target.value)}
          className={`w-full h-7 rounded-md border px-1.5 text-[11px] font-medium capitalize outline-none ${statusCls}`}
        >
          {!wooStatuses.some((s) => s.slug === o.status) && (
            <option value={o.status}>{humanize(o.status)}</option>
          )}
          {wooStatuses.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        {hasCourier ? (
          <a
            href={`https://steadfast.com.bd/t/${tracking || ops?.tracking_number}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Track on Steadfast"
            className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20"
          >
            <Truck className="h-3 w-3" />
            <span className="truncate font-mono">{tracking || ops?.tracking_number}</span>
          </a>
        ) : o.status === "confirmed" ? (
          <button
            onClick={doSend}
            disabled={sending}
            title="Send to Courier"
            className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-70"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
            Send to Courier
          </button>
        ) : null}
      </div>


    </div>
    </>
  );
}





/* ============================================================ ORDER DRAWER
   Fully editable order detail — Nori-style collapsible sections.
   Edits: customer/billing, shipping address, line items (qty/price/remove/add),
   shipping charge, fees/discount, notes, ops fields, status.
============================================================ */

type AddressForm = {
  first_name: string; last_name: string;
  email?: string; phone?: string;
  address_1: string; address_2: string;
  city: string; state: string; postcode: string; country: string;
};

type LineItemDraft = {
  id?: number;
  product_id?: number;
  variation_id?: number;
  name: string;
  sku?: string;
  image?: string;           // variant/product thumbnail
  quantity: number;
  unit_price: number;
  removed?: boolean;
};

type FeeDraft = { id?: number; name: string; total: string };
type ShippingLineDraft = { id?: number; method_id?: string; method_title: string; total: string; instance_id?: number };

function emptyAddr(): AddressForm {
  return { first_name: "", last_name: "", email: "", phone: "", address_1: "", address_2: "", city: "", state: "", postcode: "", country: "" };
}

function toAddrForm(a: any, includeContact = false): AddressForm {
  return {
    first_name: a?.first_name ?? "",
    last_name: a?.last_name ?? "",
    email: includeContact ? (a?.email ?? "") : undefined,
    phone: a?.phone ?? "",
    address_1: a?.address_1 ?? "",
    address_2: a?.address_2 ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
    postcode: a?.postcode ?? "",
    country: a?.country ?? "",
  };
}

function OrderDrawer({
  id, onClose, detailFn, statuses, onUpdate, initialOps, customerStat,
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

  // ---- Editable form state ----
  const [billing, setBilling] = useState<AddressForm>(emptyAddr());
  const [shipping, setShipping] = useState<AddressForm>(emptyAddr());
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [fees, setFees] = useState<FeeDraft[]>([]);
  const [shipLines, setShipLines] = useState<ShippingLineDraft[]>([]);
  const [customerNote, setCustomerNote] = useState("");

  // Hydrate form when order loads
  useEffect(() => {
    if (!o) return;
    setBilling(toAddrForm(o.billing, true));
    setShipping(toAddrForm(o.shipping, false));
    setItems(
      (o.line_items ?? []).map((li: any) => ({
        id: li.id,
        name: li.name,
        sku: li.sku,
        image: li.image?.src ?? undefined,
        quantity: li.quantity,
        unit_price:
          Number(li.subtotal ?? li.total ?? 0) / Math.max(1, li.quantity),
      })),
    );
    setFees(
      (o.fee_lines ?? []).map((f: any) => ({
        id: f.id, name: f.name ?? "Fee", total: String(f.total ?? "0"),
      })),
    );
    setShipLines(
      (o.shipping_lines ?? []).map((s: any) => ({
        id: s.id, method_id: s.method_id ?? "flat_rate", method_title: s.method_title ?? "Shipping", total: String(s.total ?? "0"),
      })),
    );
    setCustomerNote(o.customer_note ?? "");
  }, [o?.id, o?.date_modified]);

  // Ops fields
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

  // Save order edits (billing/shipping/items/fees/shipping charge/note)
  const updateFn = useServerFn(updateWooOrder);
  const saveOrder = useMutation({
    mutationFn: async () => {
      // Build line_items payload:
      //  - existing kept: { id, quantity, subtotal, total }
      //  - existing removed: { id, quantity: 0 }
      //  - new: { product_id, quantity, subtotal, total }
      const li = items
        .filter((i) => !(i.removed && !i.id))
        .map((i) => {
          if (i.removed && i.id) return { id: i.id, quantity: 0 };
          const line = (i.unit_price * i.quantity).toFixed(2);
          if (i.id) return { id: i.id, quantity: i.quantity, subtotal: line, total: line };
          return {
            product_id: i.product_id ?? 0,
            variation_id: i.variation_id,
            quantity: i.quantity,
            subtotal: line,
            total: line,
          };
        });

      return updateFn({
        data: {
          id,
          billing: { ...billing },
          shipping: {
            first_name: shipping.first_name, last_name: shipping.last_name,
            address_1: shipping.address_1, address_2: shipping.address_2,
            city: shipping.city, state: shipping.state,
            postcode: shipping.postcode, country: shipping.country,
            phone: shipping.phone,
          },
          line_items: li,
          fee_lines: fees.map((f) => ({ id: f.id, name: f.name, total: f.total })),
          shipping_lines: shipLines.map((s) => ({
            id: s.id, method_title: s.method_title, method_id: s.method_id || "flat_rate", total: s.total,
          })),
          customer_note: customerNote,
        },
      });
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["admin", "woo-order", id] });
      qc.invalidateQueries({ queryKey: ["admin", "woo-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rating = ratingFromStats(customerStat);

  // Computed totals preview
  const itemsSubtotal = items
    .filter((i) => !i.removed)
    .reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const shippingTotal = shipLines.reduce((s, l) => s + Number(l.total || 0), 0);
  const feesTotal = fees.reduce((s, f) => s + Number(f.total || 0), 0);
  const grandTotal = itemsSubtotal + shippingTotal + feesTotal;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Close" onClick={onClose} className="flex-1 bg-foreground/40 backdrop-blur-sm" />
      <aside className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-input px-4 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Order</div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">#{o?.number ?? "…"}</h2>
              {o && <StatusBadge status={o.status} />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveOrder.mutate()}
              disabled={saveOrder.isPending || !o}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              {saveOrder.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save changes
            </button>
            <button onClick={onClose} className="rounded-md border border-input p-1.5 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {q.isLoading || !o ? (
          <div className="flex flex-1 items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading order…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Workflow / status */}
            <Section title="Workflow" icon={<Truck className="h-3.5 w-3.5" />} defaultOpen>
              <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap rounded-xl border border-input bg-card p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(() => {
                  const ORDER = ["pending", "on-hold", "confirmed", "processing", "completed", "cancelled", "refunded", "failed"];
                  const rank = (slug: string) => {
                    const i = ORDER.indexOf(slug);
                    return i === -1 ? ORDER.length : i;
                  };
                  const sorted = [...statuses].sort((a, b) => {
                    const ra = rank(a.slug);
                    const rb = rank(b.slug);
                    if (ra !== rb) return ra - rb;
                    return a.name.localeCompare(b.name);
                  });
                  return sorted.map((s) => {
                    const active = o.status === s.slug;
                    return (
                      <button
                        key={s.slug}
                        onClick={() => onUpdate(s.slug)}
                        className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                          active
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  });
                })()}
              </div>
            </Section>

            {/* Customer & delivery — simplified */}
            <Section
              title="Customer & delivery"
              icon={<User className="h-3.5 w-3.5" />}
              defaultOpen
              rightSlot={<CustomerBadge rating={rating} />}
            >
              {customerStat && (
                <div className="mb-2 text-[11px] text-muted-foreground">
                  {customerStat.total} orders · {customerStat.completed} completed · {customerStat.cancelled} cancelled
                </div>
              )}



              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label="Name"
                  value={`${billing.first_name}${billing.last_name ? " " + billing.last_name : ""}`}
                  onChange={(v) => {
                    const parts = v.trim().split(/\s+/);
                    const first = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(" ");
                    const last = parts.length === 1 ? "" : parts[parts.length - 1];
                    setBilling({ ...billing, first_name: first, last_name: last });
                    setShipping({ ...shipping, first_name: first, last_name: last });
                  }}
                  full
                />
                <TextField
                  label="Phone"
                  value={billing.phone ?? ""}
                  onChange={(v) => {
                    setBilling({ ...billing, phone: v });
                    setShipping({ ...shipping, phone: v });
                  }}
                />
                <TextField
                  label="Email (optional)"
                  value={billing.email ?? ""}
                  onChange={(v) => setBilling({ ...billing, email: v })}
                />
                <TextField
                  label="Address"
                  value={billing.address_1}
                  onChange={(v) => {
                    setBilling({ ...billing, address_1: v });
                    setShipping({ ...shipping, address_1: v });
                  }}
                  full
                />
                <TextField
                  label="Thana"
                  value={billing.city}
                  onChange={(v) => {
                    setBilling({ ...billing, city: v, state: v });
                    setShipping({ ...shipping, city: v, state: v });
                  }}
                  full
                />
              </div>
              <label className="mt-2 block">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">Notes</span>
                <textarea
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  rows={2}
                  placeholder="Delivery instructions or customer note"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[12px]"
                />
              </label>
            </Section>

            {/* Items — editable */}
            <Section
              title={`Items (${items.filter((i) => !i.removed).length})`}
              icon={<Package className="h-3.5 w-3.5" />}
              defaultOpen
            >
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div
                    key={it.id ?? `new-${idx}`}
                    className={`flex flex-wrap items-end gap-2 rounded-md border border-input p-2 ${it.removed ? "opacity-40 line-through" : ""}`}
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-input bg-muted">
                      {it.image ? (
                        <img src={it.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{it.name || `Product #${it.product_id}`}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {it.sku ? it.sku : it.id ? `#${it.id}` : "new"}
                      </div>
                    </div>
                    <label className="text-[10px] text-muted-foreground">
                      Qty
                      <input
                        type="number" min="0"
                        value={it.quantity}
                        disabled={it.removed}
                        onChange={(e) =>
                          setItems((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: Math.max(0, Number(e.target.value)) } : x))
                        }
                        className="mt-0.5 block h-8 w-20 rounded-md border border-input bg-background px-2 text-[12px]"
                      />
                    </label>
                    <label className="text-[10px] text-muted-foreground">
                      Unit price
                      <input
                        type="number" min="0" step="0.01"
                        value={it.unit_price}
                        disabled={it.removed}
                        onChange={(e) =>
                          setItems((arr) => arr.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))
                        }
                        className="mt-0.5 block h-8 w-24 rounded-md border border-input bg-background px-2 text-[12px]"
                      />
                    </label>
                    <div className="text-right text-[12px] font-semibold tabular-nums">
                      {money(o.currency, it.unit_price * it.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((arr) =>
                          arr
                            .map((x, i) => i === idx ? { ...x, removed: !x.removed } : x)
                            .filter((x, i) => !(i === idx && !x.id && x.removed))
                        )
                      }
                      className="rounded-md border border-input p-1.5 text-destructive hover:bg-destructive/10"
                      title={it.removed ? "Restore" : "Remove"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <AddItemInline
                  currency={o.currency}
                  onAdd={(p) => setItems((arr) => [...arr, p])}
                />
              </div>
            </Section>

            {/* Totals — fixed delivery + fees/discount */}
            <Section title="Totals & discounts" icon={<Receipt className="h-3.5 w-3.5" />} defaultOpen>
              {/* Delivery charge — editable */}
              <div className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Delivery charge
                </div>
                <ShippingLinesEditor
                  currency={o.currency}
                  shipLines={shipLines}
                  onChange={setShipLines}
                />
              </div>

              {/* Fees / discounts */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees / discounts</div>
                  <button
                    type="button"
                    onClick={() => setFees((a) => [...a, { name: "Discount", total: "-0" }])}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-input px-2 text-[10px] hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> Add line
                  </button>
                </div>
                {fees.length > 0 && (
                  <p className="mb-2 text-[10px] text-muted-foreground">Negative for a discount (e.g. <span className="font-mono">-100</span>).</p>
                )}
                {fees.map((f, i) => (
                  <div key={f.id ?? `f-${i}`} className="mt-1 flex items-end gap-2">
                    <TextField
                      label="Name"
                      value={f.name}
                      onChange={(v) => setFees((a) => a.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                    />
                    <label className="text-[10px] text-muted-foreground">
                      Amount
                      <input
                        type="number" step="0.01"
                        value={f.total}
                        onChange={(e) => setFees((a) => a.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))}
                        className="mt-0.5 block h-8 w-28 rounded-md border border-input bg-background px-2 text-[12px]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setFees((a) => a.filter((_, j) => j !== i))}
                      className="rounded-md border border-input p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Preview totals */}
              <div className="mt-4 space-y-1 rounded-md border border-input bg-muted/30 p-3 text-[13px]">
                <TotalRow label="Items subtotal">{money(o.currency, itemsSubtotal)}</TotalRow>
                <TotalRow label="Delivery">{money(o.currency, shippingTotal)}</TotalRow>
                {feesTotal !== 0 && <TotalRow label="Fees / discounts">{money(o.currency, feesTotal)}</TotalRow>}
                <div className="flex items-center justify-between pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{money(o.currency, grandTotal)}</span>
                </div>
              </div>

              {/* Consignment ID (if linked to Steadfast) */}
              {initialOps?.steadfast_consignment_id ? (
                <div className="mt-3 flex items-center justify-between rounded-md border border-input px-3 py-2 text-[12px]">
                  <span className="text-muted-foreground">Consignment ID</span>
                  <span className="font-mono font-medium">{initialOps.steadfast_consignment_id}</span>
                </div>
              ) : null}
            </Section>

            {/* Order notes — WooCommerce private notes */}
            <OrderNotesSection orderId={id} />

            {/* Timeline */}
            <Section title="Timeline" icon={<Clock className="h-3.5 w-3.5" />}>
              <ul className="space-y-1 text-[12px]">
                <li><span className="text-muted-foreground">Placed:</span> {new Date(o.date_created).toLocaleString()}</li>
                {o.date_paid && <li><span className="text-muted-foreground">Paid:</span> {new Date(o.date_paid).toLocaleString()}</li>}
                {o.date_completed && <li><span className="text-muted-foreground">Completed:</span> {new Date(o.date_completed).toLocaleString()}</li>}
                <li><span className="text-muted-foreground">Last modified:</span> {new Date(o.date_modified).toLocaleString()}</li>
              </ul>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({
  title, icon, children, defaultOpen = false, rightSlot,
}: {
  title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean; rightSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-input">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30"
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon} {title}
        </span>
        <span className="flex items-center gap-2">
          {rightSlot}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function TextField({
  label, value, onChange, full,
}: {
  label: string; value: string; onChange: (v: string) => void; full?: boolean;
}) {
  return (
    <label className={full ? "col-span-2 block" : "block"}>
      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px] outline-none focus:border-ring"
      />
    </label>
  );
}

function TotalRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{children}</span>
    </div>
  );
}

/** Order notes — reads/writes WooCommerce notes and sends SMS to the customer. */
function OrderNotesSection({ orderId }: { orderId: number }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrderNotes);
  const addFn = useServerFn(addOrderNote);
  const smsFn = useServerFn(sendCustomerMessage);
  const tplFn = useServerFn(listMessageTemplates);

  const [text, setText] = useState("");
  const [asCustomer, setAsCustomer] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "order-notes", orderId],
    queryFn: () => listFn({ data: { id: orderId } }),
    staleTime: 60_000,
  });

  const tpls = useQuery({
    queryKey: ["admin", "message-templates"],
    queryFn: () => tplFn(),
    staleTime: 5 * 60_000,
  });

  const kind: "note" | "sms" = asCustomer ? "sms" : "note";
  const filteredTpls: MessageTemplate[] = (tpls.data ?? []).filter((t) => t.kind === kind);

  const addNote = useMutation({
    mutationFn: () =>
      addFn({ data: { id: orderId, note: text.trim(), customer_note: false } }),
    onSuccess: () => {
      setText("");
      toast.success("Note added");
      qc.invalidateQueries({ queryKey: ["admin", "order-notes", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendSms = useMutation({
    mutationFn: () => smsFn({ data: { id: orderId, message: text.trim() } }),
    onSuccess: (r) => {
      setText("");
      if (r.ok) toast.success(`SMS sent${r.phone ? ` → ${r.phone}` : ""}`);
      else toast.error(`SMS failed: ${r.providerMessage || "unknown error"}`);
      qc.invalidateQueries({ queryKey: ["admin", "order-notes", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notes = (q.data?.notes ?? []) as WooOrderNote[];
  const busy = addNote.isPending || sendSms.isPending;

  const applyTemplate = (t: MessageTemplate) => {
    setText(t.body);
    setPickerOpen(false);
  };

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    if (asCustomer) sendSms.mutate();
    else addNote.mutate();
  };

  return (
    <Section title="Order notes" icon={<Receipt className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-2">
        {/* Template picker */}
        <div className="relative">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {asCustomer ? "Customer SMS templates" : "Private note templates"}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-input px-2 text-[10px] hover:bg-muted"
            >
              {pickerOpen ? "Close" : "Choose template"}
              <ChevronDown className={`h-3 w-3 transition ${pickerOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {pickerOpen && (
            <div className="mb-2 max-h-56 overflow-auto rounded-md border border-input bg-background p-1">
              {tpls.isLoading && (
                <p className="p-2 text-[11px] text-muted-foreground">Loading…</p>
              )}
              {!tpls.isLoading && filteredTpls.length === 0 && (
                <p className="p-2 text-[11px] text-muted-foreground">
                  No {kind === "sms" ? "SMS" : "note"} templates yet. Add them in Settings → Templates.
                </p>
              )}
              {filteredTpls.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">{t.body}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={
            asCustomer
              ? "Write an SMS to send to the customer…"
              : "Add a private note (stored on WooCommerce)…"
          }
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[12px]"
        />

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={asCustomer}
              onChange={(e) => {
                setAsCustomer(e.target.checked);
                setPickerOpen(false);
              }}
              className="h-3 w-3"
            />
            Notify customer (send SMS)
          </label>
          <div className="flex items-center gap-2">
            {asCustomer && (
              <span className="text-[10px] text-muted-foreground">
                {text.trim().length}/1000
              </span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={busy || !text.trim()}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2.5 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : asCustomer ? (
                <Send className="h-3 w-3" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {asCustomer ? "Send Message" : "Add note"}
            </button>
          </div>
        </div>

        <div className="mt-2 space-y-1.5">
          {q.isLoading && (
            <p className="text-[11px] text-muted-foreground">Loading notes…</p>
          )}
          {!q.isLoading && notes.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No notes yet.</p>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className={`rounded-md border px-2.5 py-1.5 text-[12px] ${
                n.customer_note
                  ? "border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20"
                  : "border-input bg-muted/30"
              }`}
            >
              <div className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {n.author || "System"}
                  {n.customer_note ? " · to customer" : " · private"}
                </span>
                <span>{new Date(n.date_created).toLocaleString()}</span>
              </div>
              <div
                className="whitespace-pre-wrap text-foreground"
                dangerouslySetInnerHTML={{ __html: n.note }}
              />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Inline "add product" — searches Woo products; expands variable products into their variations. */
function AddItemInline({
  currency, onAdd,
}: {
  currency: string;
  onAdd: (item: LineItemDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const searchFn = useServerFn(listProducts);
  const varFn = useServerFn(listProductVariations);

  // Debounce query so keystrokes don't hammer the API and lose focus.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ["admin", "add-item-search", debounced],
    queryFn: () => searchFn({ data: { search: debounced, perPage: 12 } }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const variations = useQuery({
    queryKey: ["admin", "add-item-variations", expandedId],
    queryFn: () => varFn({ data: { productId: expandedId! } }),
    enabled: !!expandedId,
    staleTime: 60_000,
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-input px-2 text-[11px] hover:bg-muted"
      >
        <Plus className="h-3 w-3" /> Add product
      </button>
    );
  }

  const products = results.data?.products ?? [];

  return (
    <div className="rounded-md border border-input p-2">
      <div className="mb-1 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product name or SKU…"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
        />
        <button
          type="button"
          onClick={() => { setOpen(false); setQuery(""); setExpandedId(null); }}
          className="rounded-md border border-input p-1.5 hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {results.isLoading && debounced.length >= 2 && (
        <div className="flex items-center gap-1 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Searching…
        </div>
      )}
      {debounced.length >= 2 && !results.isLoading && products.length === 0 && (
        <div className="py-2 text-center text-[11px] text-muted-foreground">No matches</div>
      )}

      <div className="max-h-80 overflow-y-auto">
        {products.map((p) => {
          const isVariable = p.type === "variable" || (p.variations?.length ?? 0) > 0;
          const img = p.images?.[0]?.src;
          const price = Number(p.price || p.regular_price || 0);
          if (!isVariable) {
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onAdd({
                    product_id: p.id,
                    name: p.name,
                    sku: p.sku,
                    image: img,
                    quantity: 1,
                    unit_price: price,
                  });
                  setOpen(false); setQuery(""); setExpandedId(null);
                }}
                className="flex w-full items-center gap-2 border-t border-input px-1 py-1.5 text-left text-[12px] first:border-t-0 hover:bg-muted"
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                  {img && <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1 truncate">
                  <div className="truncate">{p.name}</div>
                  {p.sku && <div className="truncate font-mono text-[10px] text-muted-foreground">{p.sku}</div>}
                </div>
                <div className="tabular-nums text-muted-foreground">{money(currency, price)}</div>
              </button>
            );
          }
          // Variable product — expand into variations.
          const expanded = expandedId === p.id;
          return (
            <div key={p.id} className="border-t border-input first:border-t-0">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : p.id)}
                className="flex w-full items-center gap-2 px-1 py-1.5 text-left text-[12px] hover:bg-muted"
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                  {img && <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1 truncate">
                  <div className="truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.variations?.length ?? 0} variations · tap to choose
                  </div>
                </div>
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {expanded && (
                <div className="ml-10 border-l border-input pl-2">
                  {variations.isLoading && (
                    <div className="flex items-center gap-1 py-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading variations…
                    </div>
                  )}
                  {(variations.data?.variations ?? []).map((v) => {
                    const vImg = v.image?.src || img;
                    const vPrice = Number(v.price || v.regular_price || 0);
                    const label = v.attributes?.map((a) => a.option).filter(Boolean).join(" / ") || `#${v.id}`;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          onAdd({
                            product_id: p.id,
                            variation_id: v.id,
                            name: `${p.name} — ${label}`,
                            sku: v.sku,
                            image: vImg,
                            quantity: 1,
                            unit_price: vPrice,
                          });
                          setOpen(false); setQuery(""); setExpandedId(null);
                        }}
                        className="flex w-full items-center gap-2 border-t border-input/70 px-1 py-1.5 text-left text-[12px] first:border-t-0 hover:bg-muted"
                      >
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                          {vImg && <img src={vImg} alt="" className="h-full w-full object-cover" loading="lazy" />}
                        </div>
                        <div className="min-w-0 flex-1 truncate">
                          <div className="truncate">{label}</div>
                          {v.sku && <div className="truncate font-mono text-[10px] text-muted-foreground">{v.sku}</div>}
                        </div>
                        <div
                          className={`text-[10px] ${v.stock_status === "instock" ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {v.stock_status === "instock" ? "In stock" : "Out"}
                        </div>
                        <div className="tabular-nums text-muted-foreground">{money(currency, vPrice)}</div>
                      </button>
                    );
                  })}
                  {!variations.isLoading && (variations.data?.variations ?? []).length === 0 && (
                    <div className="py-1 text-[11px] text-muted-foreground">No variations available.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Delivery charge editor — pick from live WooCommerce shipping methods. */
function ShippingLinesEditor({
  currency,
  shipLines,
  onChange,
}: {
  currency: string;
  shipLines: ShippingLineDraft[];
  onChange: (next: ShippingLineDraft[]) => void;
}) {
  const fn = useServerFn(listShippingMethods);
  const q = useQuery({
    queryKey: ["admin", "shipping-methods"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  const methods = q.data?.methods ?? [];

  const pickMethod = (idx: number, key: string) => {
    const m = methods.find((x) => `${x.zone_id}:${x.instance_id}` === key);
    if (!m) return;
    onChange(
      shipLines.map((s, j) =>
        j === idx
          ? {
              ...s,
              method_id: m.method_id,
              method_title: `${m.method_title}${m.zone_name ? ` (${m.zone_name})` : ""}`,
              instance_id: m.instance_id,
              total: m.cost || "0",
            }
          : s,
      ),
    );
  };

  const addLine = () => {
    const first = methods[0];
    onChange([
      ...shipLines,
      first
        ? {
            method_id: first.method_id,
            method_title: `${first.method_title}${first.zone_name ? ` (${first.zone_name})` : ""}`,
            instance_id: first.instance_id,
            total: first.cost || "0",
          }
        : { method_id: "flat_rate", method_title: "Delivery", total: "0" },
    ]);
  };

  const removeLine = (idx: number) => onChange(shipLines.filter((_, j) => j !== idx));

  return (
    <div>
      {shipLines.length === 0 && (
        <button
          type="button"
          onClick={addLine}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-input px-2 text-[11px] hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Add delivery charge
        </button>
      )}
      {shipLines.map((s, i) => {
        const currentKey = methods.find(
          (m) => m.instance_id === s.instance_id,
        );
        return (
          <div key={s.id ?? `s-${i}`} className="mt-1 flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1 text-[10px] text-muted-foreground">
              Method
              <select
                value={currentKey ? `${currentKey.zone_id}:${currentKey.instance_id}` : ""}
                onChange={(e) => pickMethod(i, e.target.value)}
                className="mt-0.5 block h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
              >
                {!currentKey && (
                  <option value="">
                    {s.method_title || "Choose a method"}
                  </option>
                )}
                {q.isLoading && <option>Loading…</option>}
                {methods.map((m) => (
                  <option key={`${m.zone_id}:${m.instance_id}`} value={`${m.zone_id}:${m.instance_id}`}>
                    {m.zone_name} — {m.method_title} ({money(currency, Number(m.cost || 0))})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              Amount
              <input
                type="number" min="0" step="0.01"
                value={s.total}
                onChange={(e) =>
                  onChange(shipLines.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))
                }
                className="mt-0.5 block h-8 w-28 rounded-md border border-input bg-background px-2 text-[12px]"
              />
            </label>
            <button
              type="button"
              onClick={() => removeLine(i)}
              className="rounded-md border border-input p-1.5 text-destructive hover:bg-destructive/10"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {shipLines.length > 0 && (
        <button
          type="button"
          onClick={addLine}
          className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-input px-2 text-[11px] hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Add another
        </button>
      )}
    </div>
  );
}



function CustomerInsightDrawer({
  email,
  phone,
  name,
  statuses,
  onUpdateStatus,
  onClose,
  onOpenOrder,
}: {
  email: string;
  phone?: string;
  name?: string;
  statuses: WooStatus[];
  onUpdateStatus: (id: number, s: string) => void;
  onClose: () => void;
  onOpenOrder: (id: number) => void;
}) {
  const listFn = useServerFn(listCustomerOrders);
  const verifyFn = useServerFn(verifyCustomerPhone);

  const ordersQ = useQuery({
    queryKey: ["admin", "customer-orders", email],
    queryFn: () => listFn({ data: { email } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const hoorinQ = useQuery({
    queryKey: ["admin", "hoorin-report", phone ?? ""],
    queryFn: () => verifyFn({ data: { phone: phone! } }),
    enabled: !!phone,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const orders = ordersQ.data?.orders ?? [];
  const latest = orders[0];
  const displayName =
    name ||
    (latest
      ? `${latest.billing?.first_name ?? ""} ${latest.billing?.last_name ?? ""}`.trim()
      : "");
  const displayPhone = phone || latest?.billing?.phone;
  const currency = latest?.currency ?? "";
  const totalSpent = orders
    .filter((o) => o.status === "completed")
    .reduce((s, o) => s + Number(o.total || 0), 0);
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const report = hoorinQ.data;
  const overall = report?.overall;
  const ratio = overall ? Number(overall.success_ratio ?? 0) : null;
  const ratioCls =
    ratio === null
      ? "bg-muted text-muted-foreground"
      : ratio >= 80
        ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
        : ratio >= 50
          ? "bg-amber-500/10 text-amber-700 ring-amber-500/20"
          : "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  const totalDeliveries = overall ? Number(overall.total_parcels ?? 0) : 0;
  const delivered = overall ? Number(overall.delivered_parcels ?? 0) : 0;
  const cancelled = overall ? Number(overall.cancelled_parcels ?? 0) : 0;

  // Derive a stable profile from the most recent order.
  const addr = latest
    ? [
        latest.shipping?.address_1 || latest.billing?.address_1,
        latest.shipping?.address_2 || latest.billing?.address_2,
        latest.shipping?.city || latest.billing?.city,
        latest.shipping?.state || latest.billing?.state,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const initials =
    (displayName || email)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  // Customer tag
  const rating: CustomerRating =
    orders.length === 0
      ? "new"
      : ratio !== null && ratio < 50
        ? "risk"
        : ratio !== null && ratio >= 80
          ? "perfect"
          : "average";

  return (
    <div className="fixed inset-0 z-50 flex" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-foreground/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label="Customer insight"
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-card"
      >
        {/* Header — profile card */}
        <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-muted/60 to-transparent px-5 py-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground text-[13px] font-semibold text-background">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-[16px] font-semibold">
                {displayName || email}
              </div>
              <CustomerBadge rating={rating} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {displayPhone && (
                <a
                  href={`tel:${displayPhone}`}
                  className="tabular-nums hover:text-foreground hover:underline"
                >
                  {displayPhone}
                </a>
              )}
              <a href={`mailto:${email}`} className="truncate hover:text-foreground hover:underline">
                {email}
              </a>
            </div>
            {addr && (
              <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground" title={addr}>
                {addr}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <InsightKpi
            label="Zonash orders"
            value={ordersQ.isLoading ? "…" : orders.length.toString()}
            sub={
              statusCounts.completed
                ? `${statusCounts.completed} completed`
                : undefined
            }
          />
          <InsightKpi
            label="Total spent"
            value={ordersQ.isLoading ? "…" : money(currency, totalSpent)}
          />
          <InsightKpi
            label="Courier success"
            value={
              !phone
                ? "—"
                : hoorinQ.isLoading
                  ? "…"
                  : ratio !== null
                    ? `${ratio}%`
                    : "—"
            }
            valueClass={ratioCls}
            sub={overall ? `${totalDeliveries} parcels` : undefined}
          />
          <InsightKpi
            label="Deliveries"
            value={
              !phone
                ? "—"
                : hoorinQ.isLoading
                  ? "…"
                  : totalDeliveries.toString()
            }
            sub={
              overall
                ? `${delivered} ok · ${cancelled} cancel`
                : undefined
            }
          />
        </div>

        {/* Per-courier strip — same visual language as KPI strip */}
        {phone && (
          <div className="border-t border-border">
            {hoorinQ.isLoading ? (
              <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking courier history…
              </div>
            ) : hoorinQ.error ? (
              <div className="px-4 py-2 text-[11px] text-rose-700">
                {(hoorinQ.error as Error).message}
              </div>
            ) : report?.success && report.couriers ? (
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                {(["steadfast", "redx", "pathao", "carrybee"] as const).map((k) => {
                  const b = report.couriers?.[k];
                  const has = b && typeof b.total_parcels === "number";
                  const total = has ? Number(b!.total_parcels) : 0;
                  const del = has ? Number(b!.delivered_parcels ?? 0) : 0;
                  const canc = has ? Number(b!.cancelled_parcels ?? 0) : 0;
                  const r = has && total > 0 ? Math.round((del / total) * 100) : null;
                  return (
                    <InsightKpi
                      key={k}
                      label={k}
                      value={has ? `${del}/${total}` : "—"}
                      sub={
                        has
                          ? r !== null
                            ? `${r}% success · ${canc} cancel`
                            : `${canc} cancel`
                          : (b?.message ?? "no data")
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-2 text-[11px] italic text-muted-foreground">
                No courier history for this number.
              </div>
            )}
          </div>
        )}

        {/* Body — single scroll, no tabs */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">




          {/* Orders — full list with inline status controls */}
          <div>
            <SectionHeader>Orders ({orders.length})</SectionHeader>
            {ordersQ.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
              </div>
            ) : orders.length === 0 ? (
              <div className="py-6 text-center text-[12px] italic text-muted-foreground">
                No orders yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {orders.map((o) => (
                  <OrderInsightRow
                    key={o.id}
                    o={o}
                    statuses={statuses}
                    onOpen={() => onOpenOrder(o.id)}
                    onUpdateStatus={(s) => onUpdateStatus(o.id, s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function OrderInsightRow({
  o,
  statuses,
  onOpen,
  onUpdateStatus,
}: {
  o: import("@/lib/woo.server").WooOrder;
  statuses: WooStatus[];
  onOpen: () => void;
  onUpdateStatus: (s: string) => void;
}) {
  const shipping = Number(o.shipping_total || 0);
  const items = Number(o.total || 0) - shipping;
  const skus = (o.line_items ?? [])
    .map((li) => li.sku || li.name)
    .filter(Boolean);

  // Quick-action targets: only actionable transitions relative to current status.
  const quick: { slug: string; label: string; cls: string }[] = [];
  const has = (s: string) => statuses.some((x) => x.slug === s);
  if (o.status !== "processing" && has("processing"))
    quick.push({
      slug: "processing",
      label: "Confirm",
      cls: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20",
    });
  if (o.status !== "completed" && has("completed"))
    quick.push({
      slug: "completed",
      label: "Complete",
      cls: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20",
    });
  if (o.status !== "cancelled" && has("cancelled"))
    quick.push({
      slug: "cancelled",
      label: "Cancel",
      cls: "bg-rose-500/10 text-rose-700 hover:bg-rose-500/20",
    });

  return (
    <div className="group rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <button
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          aria-label={`Open order ${o.number}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold">#{o.number}</span>
            <StatusBadge status={o.status} />
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {new Date(o.date_created).toLocaleDateString()}
            </span>
          </div>
          {skus.length > 0 && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {skus.slice(0, 3).join(", ")}
              {skus.length > 3 && ` +${skus.length - 3}`}
            </div>
          )}
        </button>
        <div className="shrink-0 text-right text-[11px] leading-tight">
          <div className="text-muted-foreground tabular-nums">
            {money(o.currency, items)} + {money(o.currency, shipping)}
          </div>
          <div className="text-[13px] font-semibold tabular-nums">
            {money(o.currency, o.total)}
          </div>
        </div>
      </div>
      {/* Status quick actions */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {quick.map((q) => (
          <button
            key={q.slug}
            onClick={() => onUpdateStatus(q.slug)}
            className={`inline-flex h-6 items-center rounded-md px-2 text-[10px] font-medium transition-colors ${q.cls}`}
          >
            {q.label}
          </button>
        ))}
        <select
          value={o.status}
          onChange={(e) => {
            if (e.target.value !== o.status) onUpdateStatus(e.target.value);
          }}
          className="ml-auto h-6 rounded-md border border-input bg-background px-1.5 text-[10px]"
          aria-label="Change status"
        >
          {!statuses.some((s) => s.slug === o.status) && (
            <option value={o.status}>{o.status}</option>
          )}
          {statuses.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={onOpen}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-input bg-background px-2 text-[10px] font-medium hover:bg-muted"
        >
          Open
        </button>
      </div>
    </div>
  );
}


function InsightKpi({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-[16px] font-semibold tabular-nums ${
          valueClass && !/^\d/.test(value) ? "" : ""
        }`}
      >
        {valueClass ? (
          <span
            className={`inline-block rounded-md px-1.5 py-[1px] text-[13px] ring-1 ${valueClass}`}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </div>
      {sub && (
        <div className="text-[10px] tabular-nums text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

function OrderMiniRow({
  o,
  onClick,
  expanded,
}: {
  o: import("@/lib/woo.server").WooOrder;
  onClick: () => void;
  expanded?: boolean;
}) {
  const shipping = Number(o.shipping_total || 0);
  const items = Number(o.total || 0) - shipping;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 border-b border-border/60 px-4 text-left hover:bg-muted/40 ${
        expanded ? "py-3" : "rounded-md border py-2"
      }`}
    >
      <div className="w-20 shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {new Date(o.date_created).toLocaleDateString()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium">#{o.number}</span>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {(o.line_items ?? [])
            .map((li) => li.sku || li.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(", ")}
          {(o.line_items?.length ?? 0) > 3 && ` +${o.line_items.length - 3}`}
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] leading-tight">
        <div className="text-muted-foreground tabular-nums">
          {money(o.currency, items)} + {money(o.currency, shipping)}
        </div>
        <div className="text-[13px] font-semibold tabular-nums">
          = {money(o.currency, o.total)}
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Steadfast integration panel (inside the order drawer's Operations section).
// ---------------------------------------------------------------------------
function SteadfastPanel({
  wcOrderId,
  initialOps,
  onSynced,
}: {
  wcOrderId: number;
  initialOps?: OrderOps;
  onSynced: (patch: { courier?: string; tracking?: string }) => void;
}) {
  const sendFn = useServerFn(sendOrderToSteadfast);
  const refreshFn = useServerFn(refreshSteadfastStatus);

  const ops = initialOps as
    | (OrderOps & {
        steadfast_consignment_id?: number | null;
        steadfast_tracking_code?: string | null;
        steadfast_status?: string | null;
      })
    | undefined;

  const cid = ops?.steadfast_consignment_id ?? null;
  const trackingCode = ops?.steadfast_tracking_code ?? null;
  const sfStatus = ops?.steadfast_status ?? null;

  const sendM = useMutation({
    mutationFn: () => sendFn({ data: { wc_order_id: wcOrderId } }),
    onSuccess: (r: { consignment_id: number; tracking_code: string; status: string }) => {
      toast.success(`Sent to Steadfast · ${r.tracking_code}`);
      onSynced({ courier: "Steadfast", tracking: r.tracking_code });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshM = useMutation({
    mutationFn: () => refreshFn({ data: { wc_order_id: wcOrderId } }),
    onSuccess: (r: { status: string }) => {
      toast.success(`Status: ${r.status}`);
      onSynced({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-input bg-muted/30 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Truck className="h-3 w-3" /> Steadfast Courier
        </div>
        {sfStatus && (
          <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium capitalize">
            {sfStatus.replace(/_/g, " ")}
          </span>
        )}
      </div>
      {cid ? (
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Consignment</div>
            <div className="tabular-nums">{cid}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Tracking</div>
            <div className="font-mono">{trackingCode ?? "—"}</div>
          </div>
        </div>
      ) : (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Not sent to Steadfast yet. This will push the recipient, address, and COD amount to portal.packzy.com.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => sendM.mutate()}
          disabled={sendM.isPending || !!cid}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {sendM.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {cid ? "Already sent" : "Send to Steadfast"}
        </button>
        {cid && (
          <button
            onClick={() => refreshM.mutate()}
            disabled={refreshM.isPending}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-[11px] hover:bg-muted disabled:opacity-50"
          >
            {refreshM.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Refresh status
          </button>
        )}
        {trackingCode && (
          <a
            href={`https://steadfast.com.bd/t/${trackingCode}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-[11px] hover:bg-muted"
          >
            Track
          </a>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hoorin customer verification (compact inline panel in the order drawer)
// -----------------------------------------------------------------------------

function HoorinVerifyPanel({ phone }: { phone: string }) {
  const verifyFn = useServerFn(verifyCustomerPhone);
  const historyFn = useServerFn(getCustomerHistory);
  const [open, setOpen] = useState(true);
  const [report, setReport] = useState<HoorinReport | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);

  const trimmed = (phone || "").replace(/\D+/g, "");
  const hasPhone = trimmed.length >= 10;

  // Auto-load cached customer history (past Zonash orders + saved thanas) on mount.
  const histQ = useQuery({
    queryKey: ["admin", "customer-history", trimmed],
    queryFn: () => historyFn({ data: { phone: trimmed } }),
    enabled: hasPhone,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (histQ.data) setHistory(histQ.data);
  }, [histQ.data]);

  const verifyMut = useMutation({
    mutationFn: async (fresh: boolean) => verifyFn({ data: { phone, fresh } }),
    onSuccess: (r) => {
      setReport(r);
      setOpen(true);
      if (!r?.success) toast.warning(r?.message || "No delivery history found");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Verification failed"),
  });

  const refreshHistMut = useMutation({
    mutationFn: () => historyFn({ data: { phone: trimmed, refresh: true } }),
    onSuccess: (r) => {
      setHistory(r);
      toast.success("Customer history refreshed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "History refresh failed"),
  });

  const disabled = !hasPhone || verifyMut.isPending;
  const thanaSet = Array.from(
    new Set(
      [
        ...(history?.thanas ?? []),
        ...(history?.courierThanas ?? []),
      ]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);

  return (
    <div className="mb-2 rounded-md border border-input bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          Customer verification
          <span className="text-muted-foreground">
            (Zonash · Steadfast · RedX · Pathao · Carrybee)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {(report || history) && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              {open ? "Hide" : "Show"}
            </button>
          )}
          <button
            onClick={() => verifyMut.mutate(false)}
            disabled={disabled}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-[11px] hover:bg-muted disabled:opacity-50"
          >
            {verifyMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            {report ? "Re-check" : "Verify"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Past Zonash orders + cached thanas */}
          {hasPhone && (
            <div className="rounded-md border border-input bg-background/60 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>
                  Past orders on Zonash
                  {history?.cached && (
                    <span className="ml-1 rounded bg-muted px-1 py-[1px] text-[9px] normal-case tracking-normal">
                      cached
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => refreshHistMut.mutate()}
                  disabled={refreshHistMut.isPending}
                  className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {refreshHistMut.isPending ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {histQ.isLoading && !history ? (
                <p className="text-[11px] text-muted-foreground">Loading history…</p>
              ) : !history || history.orders.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No previous orders found for this phone.
                </p>
              ) : (
                <>
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    {history.orders.length} order{history.orders.length === 1 ? "" : "s"} ·{" "}
                    {thanaSet.length} thana{thanaSet.length === 1 ? "" : "s"} on file
                  </div>
                  <ul className="max-h-40 space-y-1 overflow-auto pr-1">
                    {history.orders.slice(0, 10).map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center justify-between gap-2 rounded border border-input/60 bg-muted/20 px-2 py-1 text-[11px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">#{o.number}</span>
                            <span className="rounded bg-muted px-1 py-[1px] text-[9px] uppercase tracking-wide text-foreground/70">
                              {o.status.replace(/-/g, " ")}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(o.date).toLocaleDateString()}
                            </span>
                          </div>
                          {o.thana && (
                            <div className="truncate text-[10px] text-muted-foreground">
                              📍 {o.thana}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-[11px] tabular-nums">
                          BDT {Number(o.total || 0).toFixed(0)}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {thanaSet.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Known thanas (courier + past orders)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {thanaSet.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-input bg-background px-1.5 py-[1px] text-[10px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {report && <HoorinReportView report={report} />}
        </div>
      )}
    </div>
  );
}
