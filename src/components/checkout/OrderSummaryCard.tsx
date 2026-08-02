import { useState } from "react";
import { ChevronDown, Package, MapPin, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicOrderById, type PublicOrder } from "@/lib/public-order.functions";
import { formatBDT } from "@/lib/format";

/**
 * Compact, collapsible order summary shared by every verification flow page
 * (review, callback-choice, pending, confirmed). Sections are collapsed by
 * default so the page reads like an app receipt rather than a wall of text.
 */
export function OrderSummaryCard({ orderId }: { orderId: number }) {
  const fn = useServerFn(getPublicOrderById);
  const { data, isLoading } = useQuery({
    queryKey: ["public-order", orderId],
    queryFn: () => fn({ data: { id: orderId } }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="mt-5 flex items-center justify-center rounded-2xl border border-border bg-card/50 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const order = data?.order;
  if (!order) return null;
  return <OrderSummaryInner order={order} />;
}

function OrderSummaryInner({ order }: { order: PublicOrder }) {
  const itemCount = order.line_items.reduce((s, li) => s + li.quantity, 0);
  const totalNum = Number(order.total);
  const shipNum = Number(order.shipping_total);
  const discNum = Number(order.discount_total);
  const subNum = Number(order.subtotal);

  return (
    <div className="mt-5 space-y-2">
      {/* Price strip — always visible */}
      <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Total · {itemCount} item{itemCount === 1 ? "" : "s"}
        </div>
        <div className="text-base font-bold text-primary">{formatBDT(totalNum)}</div>
      </div>

      {/* Products — collapsed */}
      <Collapsible
        icon={<Package className="h-3.5 w-3.5" />}
        label="Products"
        meta={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
      >
        <ul className="space-y-2.5 pt-1">
          {order.line_items.map((li, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
                {li.image ? (
                  <img src={li.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{li.name}</div>
                {li.variation && (
                  <div className="truncate text-[10.5px] text-muted-foreground">
                    {li.variation}
                  </div>
                )}
                <div className="text-[10.5px] text-muted-foreground">
                  Qty {li.quantity}
                  {li.sku ? ` · ${li.sku}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-[12px] font-semibold">
                {formatBDT(Number(li.total ?? 0))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-dashed border-border pt-2 text-[12px]">
          <Row label="Subtotal" value={formatBDT(subNum)} />
          {discNum > 0 && <Row label="Discount" value={`− ${formatBDT(discNum)}`} />}
          <Row label="Delivery Charge" value={formatBDT(shipNum)} />
          <Row label="Total" value={formatBDT(totalNum)} strong />
        </div>
      </Collapsible>

      {/* Delivery info — collapsed */}
      <Collapsible
        icon={<MapPin className="h-3.5 w-3.5" />}
        label="Delivery information"
        meta={order.billing.area || undefined}
      >
        <dl className="grid grid-cols-[86px_1fr] gap-y-1.5 pt-1 text-[12px]">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium">{order.billing.name || "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="font-medium">{order.billing.phone || "—"}</dd>
          {order.billing.email && (
            <>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{order.billing.email}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Address</dt>
          <dd className="font-medium">{order.billing.address || "—"}</dd>
          <dt className="text-muted-foreground">Area</dt>
          <dd className="font-medium">{order.billing.area || "—"}</dd>
          <dt className="text-muted-foreground">Payment</dt>
          <dd className="font-medium">
            {order.payment_method_title || "Cash on Delivery"}
          </dd>
          {order.customer_note && (
            <>
              <dt className="text-muted-foreground">Note</dt>
              <dd className="font-medium">{order.customer_note}</dd>
            </>
          )}
        </dl>
      </Collapsible>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold text-foreground" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

function Collapsible({
  icon,
  label,
  meta,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="flex-1 text-[12.5px] font-semibold">{label}</span>
        {meta && (
          <span className="text-[11px] text-muted-foreground">{meta}</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 px-4 pb-3.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
