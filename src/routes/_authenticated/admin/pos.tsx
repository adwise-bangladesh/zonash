/**
 * POS — manual order entry.
 * Premium single-viewport app-like layout (no page title, no outer scroll).
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  Phone,
  MessageCircle,
  Instagram,
  Store,
  MoreHorizontal,
  Check,
  Minus,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { listProducts } from "@/lib/woo.functions";
import { createManualOrder } from "@/lib/pos.functions";
import { getPoliceStations } from "@/lib/steadfast.functions";
import { verifyCustomerPhone } from "@/lib/hoorin.functions";
import { getCustomerHistory } from "@/lib/customer-history.functions";
import { formatBDT } from "@/lib/format";

const searchSchema = z.object({
  channel: fallback(
    z.enum(["phone", "whatsapp", "messenger", "instagram", "instore", "other"]),
    "phone",
  ).default("phone"),
});

export const Route = createFileRoute("/_authenticated/admin/pos")({
  head: () => ({
    meta: [{ title: "POS — New Order" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: zodValidator(searchSchema),
  component: PosPage,
});

type CartLine = {
  product_id: number;
  variation_id?: number;
  name: string;
  sku?: string;
  image?: string;
  price: number;
  quantity: number;
};

const CHANNEL_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  phone: { label: "Phone", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  messenger: { label: "Messenger", icon: MessageCircle },
  instagram: { label: "Instagram", icon: Instagram },
  instore: { label: "In-store", icon: Store },
  other: { label: "Other", icon: MoreHorizontal },
};

function PosPage() {
  const { channel: initialChannel } = Route.useSearch();
  const navigate = useNavigate();
  const listFn = useServerFn(listProducts);
  const createFn = useServerFn(createManualOrder);
  const policeFn = useServerFn(getPoliceStations);
  const verifyFn = useServerFn(verifyCustomerPhone);
  const historyFn = useServerFn(getCustomerHistory);

  const [channel, setChannel] = useState<string>(initialChannel);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Default → most-ordered (popularity). On search → by keyword.
  const productsQ = useQuery({
    queryKey: ["pos", "products", debounced || "__popular__"],
    queryFn: () =>
      debounced.length >= 2
        ? listFn({ data: { search: debounced, perPage: 30 } })
        : listFn({ data: { orderby: "popularity", perPage: 30 } }),
    staleTime: 5 * 60_000,
  });

  const policeQ = useQuery({
    queryKey: ["pos", "police-stations"],
    queryFn: () => policeFn(),
    staleTime: 24 * 60 * 60_000,
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [thana, setThana] = useState("");
  const [notes, setNotes] = useState("");
  const [insideDhaka, setInsideDhaka] = useState(true);
  const [discount, setDiscount] = useState(0);

  // Phone-triggered verification (Hoorin + Zonash history)
  const [phoneDebounced, setPhoneDebounced] = useState("");
  useEffect(() => {
    const digits = phone.replace(/\D+/g, "");
    const t = setTimeout(() => setPhoneDebounced(digits.length >= 10 ? digits : ""), 500);
    return () => clearTimeout(t);
  }, [phone]);

  const verifyQ = useQuery({
    queryKey: ["pos", "verify", phoneDebounced],
    queryFn: () => verifyFn({ data: { phone: phoneDebounced } }),
    enabled: phoneDebounced.length >= 10,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const historyQ = useQuery({
    queryKey: ["pos", "history", phoneDebounced],
    queryFn: () => historyFn({ data: { phone: phoneDebounced } }),
    enabled: phoneDebounced.length >= 10,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const addToCart = (p: {
    id: number;
    name: string;
    sku?: string;
    price: string;
    images?: { src: string }[];
  }) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          image: p.images?.[0]?.src,
          price: Number(p.price || 0),
          quantity: 1,
        },
      ];
    });
  };

  const updateQty = (i: number, q: number) =>
    setCart((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, quantity: Math.max(1, q) } : l)),
    );
  const updatePrice = (i: number, p: number) =>
    setCart((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, price: Math.max(0, p) } : l)),
    );
  const removeLine = (i: number) =>
    setCart((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const shippingAmount = insideDhaka ? 80 : 130;
  const maxDiscount = Math.floor(subtotal * 0.4);
  const effectiveDiscount = Math.min(Math.max(0, discount), maxDiscount);
  const discountCapped = discount > maxDiscount && subtotal > 0;
  const grand = Math.max(0, subtotal + shippingAmount - effectiveDiscount);

  const canSubmit =
    cart.length > 0 &&
    name.trim().length > 0 &&
    phone.trim().length >= 5 &&
    address.trim().length > 0;

  const submit = useMutation({
    mutationFn: async (status: "on-hold" | "processing") =>
      createFn({
        data: {
          channel: channel as never,
          status,
          customer: {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            address: address.trim(),
            thana: thana.trim() || undefined,
            notes: notes.trim() || undefined,
          },
          items: cart.map((l) => ({
            product_id: l.product_id,
            variation_id: l.variation_id,
            quantity: l.quantity,
            price: l.price,
          })),
          shipping_amount: shippingAmount,
          shipping_label: insideDhaka ? "ঢাকা সিটির ভিতরে" : "ঢাকা সিটির বাহিরে",
          discount: effectiveDiscount,
        },
      }),
    onSuccess: (order) => {
      toast.success(`Order #${order.number} created`);
      navigate({ to: "/admin/orders", search: { open: order.id } as never });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to create order";
      toast.error(msg);
    },
  });

  const products = productsQ.data?.products ?? [];
  const policeItems = policeQ.data?.items ?? [];

  // Verification derived values
  const verifyReport = verifyQ.data;
  const verifyOverall = verifyReport?.overall;
  const historyOrders = historyQ.data?.orders ?? [];
  const historyThanas = useMemo(() => {
    const set = new Set<string>();
    for (const t of historyQ.data?.thanas ?? []) if (t) set.add(t);
    for (const t of historyQ.data?.courierThanas ?? []) if (t) set.add(t);
    return Array.from(set).slice(0, 8);
  }, [historyQ.data]);

  const successRatio = verifyOverall
    ? Math.round((verifyOverall.success_ratio ?? 0) * 100) / 100
    : null;
  const verifyTone =
    successRatio == null
      ? "neutral"
      : successRatio >= 85
        ? "good"
        : successRatio >= 60
          ? "warn"
          : "bad";

  return (
    <AdminShell bare>
      <div className="grid h-full grid-cols-1 gap-3 p-3 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_380px] md:p-4">
        {/* ─────────── COLUMN 1 — Product catalog (LIST) ─────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                placeholder="Find products — search name or SKU"
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
              {productsQ.isFetching && (
                <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {products.length === 0 && !productsQ.isFetching ? (
              <div className="grid h-full place-items-center px-6 text-center text-[12px] text-muted-foreground">
                No products.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {products.map((p) => {
                  const price = Number(p.price || 0);
                  const stock = (p as { stock_status?: string }).stock_status;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addToCart(p)}
                        className="group flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-muted/50"
                      >
                        <img
                          src={p.images?.[0]?.src ?? ""}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-md bg-muted object-cover ring-1 ring-border"
                        />
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="truncate text-[12.5px] font-medium text-foreground">
                            {p.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                            {p.sku && <span className="truncate">SKU {p.sku}</span>}
                            {stock && (
                              <span
                                className={
                                  stock === "instock"
                                    ? "text-emerald-600"
                                    : "text-rose-600"
                                }
                              >
                                {stock === "instock" ? "In stock" : "Out"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[12.5px] font-semibold tabular-nums text-foreground">
                            {formatBDT(price)}
                          </div>
                          <span
                            className="mt-1 inline-flex h-6 items-center gap-1 rounded-md bg-primary/10 px-2 text-[10.5px] font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ─────────── COLUMN 2 — Cart ─────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-foreground">Cart</span>
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-muted px-1.5 text-[10.5px] font-bold text-foreground/70">
                {cart.length}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {cart.reduce((s, l) => s + l.quantity, 0)} items · {formatBDT(subtotal)}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div className="text-[12px] text-muted-foreground">
                  Tap a product to add it here.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l, i) => (
                  <li
                    key={`${l.product_id}-${i}`}
                    className="flex items-center gap-2.5 px-3 py-2.5"
                  >
                    <img
                      src={l.image ?? ""}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover"
                    />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[12.5px] font-medium">{l.name}</div>
                      {l.sku && (
                        <div className="text-[10.5px] text-muted-foreground">{l.sku}</div>
                      )}
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="inline-flex items-center rounded-md border border-border">
                          <button
                            type="button"
                            onClick={() => updateQty(i, l.quantity - 1)}
                            className="grid h-6 w-6 place-items-center text-muted-foreground hover:bg-muted"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-[11.5px] font-semibold tabular-nums">
                            {l.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(i, l.quantity + 1)}
                            className="grid h-6 w-6 place-items-center text-muted-foreground hover:bg-muted"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={l.price}
                          onChange={(e) => updatePrice(i, Number(e.target.value))}
                          className="h-6 w-16 rounded-md border border-border bg-background px-1.5 text-right text-[11px] outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-[12.5px] font-semibold tabular-nums">
                        {formatBDT(l.price * l.quantity)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─────────── COLUMN 3 — Customer + channel + totals ─────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* Channel selector */}
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Order channel
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {Object.entries(CHANNEL_META).map(([k, m]) => {
                const active = channel === k;
                const Icon = m.icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setChannel(k)}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10.5px] font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Customer */}
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Customer
            </div>
            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="posinput"
                placeholder="Name *"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="posinput"
                placeholder="Mobile * (01XXXXXXXXX)"
                inputMode="tel"
              />

              {/* Verification pill (shows as soon as phone is valid) */}
              {phoneDebounced.length >= 10 && (
                <VerifyPill
                  loading={verifyQ.isFetching || historyQ.isFetching}
                  tone={verifyTone}
                  ratio={successRatio}
                  totalParcels={verifyOverall?.total_parcels ?? null}
                  delivered={verifyOverall?.delivered_parcels ?? null}
                  cancelled={verifyOverall?.cancelled_parcels ?? null}
                  zonashOrders={historyOrders.length}
                  error={
                    verifyQ.error instanceof Error
                      ? verifyQ.error.message
                      : null
                  }
                />
              )}

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="posinput"
                placeholder="Email (optional)"
                inputMode="email"
              />
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="posinput"
                placeholder="Address *"
              />

              {/* Thana — from Steadfast police stations */}
              <div>
                <input
                  value={thana}
                  onChange={(e) => setThana(e.target.value)}
                  list="pos-thana-list"
                  className="posinput"
                  placeholder={
                    policeQ.isFetching
                      ? "Thana (loading…)"
                      : policeItems.length > 0
                        ? `Thana — ${policeItems.length} stations`
                        : "Thana"
                  }
                />
                <datalist id="pos-thana-list">
                  {policeItems.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                {historyThanas.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {historyThanas.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThana(t)}
                        className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10.5px] text-foreground/80 hover:bg-primary/10 hover:text-primary"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="posinput"
                placeholder="Notes"
              />
            </div>

            <div className="mt-3 mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Delivery
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setInsideDhaka(true)}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                  insideDhaka
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                ঢাকা ভিতরে · ৳80
              </button>
              <button
                type="button"
                onClick={() => setInsideDhaka(false)}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                  !insideDhaka
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                ঢাকা বাহিরে · ৳130
              </button>
            </div>
          </div>

          {/* Totals + actions (sticky footer of column) */}
          <div className="shrink-0 border-t border-border bg-muted/30 p-3">
            <div className="space-y-1">
              <Row label="Subtotal" value={`৳ ${subtotal.toFixed(0)}`} />
              <Row label="Delivery" value={`৳ ${shippingAmount.toFixed(0)}`} />
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted-foreground">Discount</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">৳</span>
                  <input
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) =>
                      setDiscount(Math.max(0, Number(e.target.value)))
                    }
                    className="h-7 w-20 rounded-md border border-border bg-background px-1.5 text-right text-[11.5px] outline-none tabular-nums focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-border pt-2 text-[14px] font-bold">
                <span>Total (COD)</span>
                <span className="tabular-nums">৳ {grand.toFixed(0)}</span>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-[1fr_1.4fr] gap-2">
              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate("on-hold")}
                className="h-10 rounded-md border border-border bg-background text-[12px] font-semibold hover:bg-muted disabled:opacity-50"
              >
                Draft
              </button>
              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate("processing")}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
              >
                {submit.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Confirm order
              </button>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .posinput {
          height: 34px;
          width: 100%;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--background);
          padding: 6px 10px;
          font-size: 12.5px;
          outline: none;
        }
        textarea.posinput { height: auto; padding: 8px 10px; resize: vertical; }
        .posinput:focus {
          border-color: color-mix(in oklab, var(--primary) 40%, transparent);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 12%, transparent);
        }
      `}</style>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function VerifyPill({
  loading,
  tone,
  ratio,
  totalParcels,
  delivered,
  cancelled,
  zonashOrders,
  error,
}: {
  loading: boolean;
  tone: "neutral" | "good" | "warn" | "bad";
  ratio: number | null;
  totalParcels: number | null;
  delivered: number | null;
  cancelled: number | null;
  zonashOrders: number;
  error: string | null;
}) {
  const palette =
    tone === "good"
      ? { bg: "bg-emerald-50", ring: "ring-emerald-200", fg: "text-emerald-700", Icon: ShieldCheck }
      : tone === "warn"
        ? { bg: "bg-amber-50", ring: "ring-amber-200", fg: "text-amber-700", Icon: ShieldAlert }
        : tone === "bad"
          ? { bg: "bg-rose-50", ring: "ring-rose-200", fg: "text-rose-700", Icon: ShieldAlert }
          : { bg: "bg-muted/40", ring: "ring-border", fg: "text-muted-foreground", Icon: ShieldCheck };
  const { Icon } = palette;

  return (
    <div
      className={`rounded-md ${palette.bg} px-2.5 py-2 ring-1 ${palette.ring}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${palette.fg}`} />
        <div className="flex-1 text-[11.5px] font-semibold text-foreground">
          {loading ? (
            <span className="text-muted-foreground">Verifying customer…</span>
          ) : error ? (
            <span className="text-rose-600">Verification unavailable</span>
          ) : ratio == null ? (
            <span className="text-muted-foreground">No courier history</span>
          ) : (
            <span className={palette.fg}>
              {ratio}% success · {delivered ?? 0}/{totalParcels ?? 0} delivered
            </span>
          )}
        </div>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-foreground/80 ring-1 ring-border">
          Zonash · {zonashOrders}
        </span>
      </div>
      {!loading && !error && (cancelled ?? 0) > 0 && (
        <div className="mt-1 text-[10.5px] text-muted-foreground">
          {cancelled} cancelled parcel{(cancelled ?? 0) === 1 ? "" : "s"} on courier record
        </div>
      )}
    </div>
  );
}
