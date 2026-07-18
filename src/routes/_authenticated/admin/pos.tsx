/**
 * POS — manual order entry for phone/chat/instore orders.
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
  useMemo(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const productsQ = useQuery({
    queryKey: ["pos", "products", debounced],
    queryFn: () => listFn({ data: { search: debounced || undefined, perPage: 8 } }),
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

  const updateQty = (i: number, q: number) => {
    setCart((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantity: Math.max(1, q) } : l)));
  };
  const updatePrice = (i: number, p: number) => {
    setCart((prev) => prev.map((l, idx) => (idx === i ? { ...l, price: Math.max(0, p) } : l)));
  };
  const removeLine = (i: number) => setCart((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const shippingAmount = insideDhaka ? 80 : 130;
  const grand = Math.max(0, subtotal + shippingAmount - discount);

  const canSubmit =
    cart.length > 0 && name.trim().length > 0 && phone.trim().length >= 5 && address.trim().length > 0;

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
    <AdminShell
      title="Point of sale"
      subtitle="Take orders by call, chat, or in-store — Cash on Delivery."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        {/* LEFT — products + cart */}
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search products by name or SKU…"
                  className="h-10 w-full rounded-md border border-border bg-background pl-8 pr-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                {productsQ.isFetching && (
                  <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            {debounced.length >= 2 ? (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {(productsQ.data?.products ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <img
                      src={p.images?.[0]?.src ?? ""}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.sku ? `SKU ${p.sku} · ` : ""}
                        ৳ {Number(p.price || 0).toFixed(0)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-110"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </li>
                ))}
                {(productsQ.data?.products ?? []).length === 0 && !productsQ.isFetching && (
                  <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                    No products.
                  </li>
                )}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                Type 2+ letters to search products.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cart ({cart.length})
            </div>
            {cart.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                No items yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l, i) => (
                  <li key={`${l.product_id}-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <img
                      src={l.image ?? ""}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{l.name}</div>
                      {l.sku && (
                        <div className="text-[10.5px] text-muted-foreground">SKU {l.sku}</div>
                      )}
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => updateQty(i, Number(e.target.value))}
                      className="h-8 w-14 rounded-md border border-border bg-background px-2 text-center text-[12px]"
                    />
                    <input
                      type="number"
                      min={0}
                      value={l.price}
                      onChange={(e) => updatePrice(i, Number(e.target.value))}
                      className="h-8 w-20 rounded-md border border-border bg-background px-2 text-right text-[12px]"
                    />
                    <div className="w-20 text-right text-[12.5px] font-semibold">
                      ৳ {(l.price * l.quantity).toFixed(0)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* RIGHT — customer + totals */}
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Channel
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                <ChannelIcon className="h-3 w-3" />
                {CHANNEL_META[channel]?.label ?? channel}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CHANNEL_META).map(([k, m]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChannel(k)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    channel === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Customer
            </div>
            <PosField label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="posinput"
                placeholder="Customer name"
              />
            </PosField>
            <PosField label="Mobile">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="posinput"
                placeholder="01XXXXXXXXX"
              />
            </PosField>
            <PosField label="Email (optional)">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="posinput"
                placeholder="name@example.com"
              />
            </PosField>
            <PosField label="Address">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="posinput"
                placeholder="House, road, area"
              />
            </PosField>
            <PosField label="Thana">
              <input
                value={thana}
                onChange={(e) => setThana(e.target.value)}
                className="posinput"
                placeholder="Thana / area"
              />
            </PosField>
            <PosField label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="posinput"
                placeholder="Internal or customer note"
              />
            </PosField>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Delivery
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setInsideDhaka(true)}
                className={`rounded-md border px-3 py-2 text-[12px] font-medium ${
                  insideDhaka
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                ঢাকা সিটির ভিতরে · ৳80
              </button>
              <button
                type="button"
                onClick={() => setInsideDhaka(false)}
                className={`rounded-md border px-3 py-2 text-[12px] font-medium ${
                  !insideDhaka
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                ঢাকা সিটির বাহিরে · ৳130
              </button>
            </div>
            <PosField label="Discount (৳)">
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                className="posinput"
              />
            </PosField>
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <Row label="Subtotal" value={`৳ ${subtotal.toFixed(0)}`} />
            <Row label="Delivery" value={`৳ ${shippingAmount.toFixed(0)}`} />
            {discount > 0 && <Row label="Discount" value={`- ৳ ${discount.toFixed(0)}`} />}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[14px] font-semibold">
              <span>Total (COD)</span>
              <span>৳ {grand.toFixed(0)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate("on-hold")}
                className="h-10 rounded-md border border-border bg-background text-[12.5px] font-semibold hover:bg-muted disabled:opacity-50"
              >
                Save as draft
              </button>
              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate("processing")}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary text-[12.5px] font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
              >
                {submit.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Confirm order
              </button>
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .posinput {
          height: 36px;
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

function PosField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
