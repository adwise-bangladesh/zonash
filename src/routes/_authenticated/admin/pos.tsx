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
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { listProducts } from "@/lib/woo.functions";
import { createManualOrder } from "@/lib/pos.functions";

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

  const [channel, setChannel] = useState<string>(initialChannel);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const productsQ = useQuery({
    queryKey: ["pos", "products", debounced],
    queryFn: () => listFn({ data: { search: debounced || undefined, perPage: 12 } }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
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
  const grand = Math.max(0, subtotal + shippingAmount - discount);

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
          discount,
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

  const ChannelIcon = CHANNEL_META[channel]?.icon ?? Phone;

  return (
    <AdminShell bare>
      <div className="grid h-full grid-cols-1 gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] md:p-4">
        {/* COLUMN 1 — Product catalog */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                placeholder="Search products by name or SKU…"
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
              {productsQ.isFetching && (
                <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {debounced.length < 2 ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <div
                    className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
                    style={{
                      background:
                        "color-mix(in oklab, var(--primary) 10%, transparent)",
                      color: "var(--primary)",
                    }}
                  >
                    <Search className="h-6 w-6" />
                  </div>
                  <div className="text-[13px] font-semibold text-foreground">
                    Find products
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Type 2+ letters to search by name or SKU.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {(productsQ.data?.products ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      className="group flex w-full items-center gap-2 rounded-lg border border-border bg-background p-2 text-left transition hover:border-primary/30 hover:shadow-sm"
                    >
                      <img
                        src={p.images?.[0]?.src ?? ""}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-md bg-muted object-cover"
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="line-clamp-2 text-[11.5px] font-medium">
                          {p.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          {p.sku && <span className="truncate">{p.sku}</span>}
                          <span className="ml-auto font-semibold text-foreground">
                            ৳{Number(p.price || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
                {(productsQ.data?.products ?? []).length === 0 &&
                  !productsQ.isFetching && (
                    <li className="col-span-full px-3 py-8 text-center text-[12px] text-muted-foreground">
                      No products.
                    </li>
                  )}
              </ul>
            )}
          </div>
        </section>

        {/* COLUMN 2 — Cart */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-foreground">
                Cart
              </span>
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-muted px-1.5 text-[10.5px] font-bold text-foreground/70">
                {cart.length}
              </span>
            </div>
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
              style={{
                background: "color-mix(in oklab, var(--primary) 10%, transparent)",
                color: "var(--primary)",
              }}
            >
              <ChannelIcon className="h-3 w-3" />
              {CHANNEL_META[channel]?.label ?? channel}
            </div>
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
                      <div className="truncate text-[12.5px] font-medium">
                        {l.name}
                      </div>
                      {l.sku && (
                        <div className="text-[10.5px] text-muted-foreground">
                          {l.sku}
                        </div>
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
                        ৳ {(l.price * l.quantity).toFixed(0)}
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

          {/* Channel selector strip */}
          <div className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-2">
            {Object.entries(CHANNEL_META).map(([k, m]) => {
              const active = channel === k;
              const Icon = m.icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChannel(k)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* COLUMN 3 — Customer + totals */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={thana}
                  onChange={(e) => setThana(e.target.value)}
                  className="posinput"
                  placeholder="Thana"
                />
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  className="posinput text-right"
                  placeholder="Discount ৳"
                />
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
              {discount > 0 && (
                <Row label="Discount" value={`- ৳ ${discount.toFixed(0)}`} />
              )}
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
