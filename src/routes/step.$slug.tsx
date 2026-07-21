import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Truck,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { getProductBySlug, getProductVariations } from "@/lib/woo.functions";
import type { WooProduct, WooVariation } from "@/lib/woo.server";
import { submitPendingOrder } from "@/lib/otp.functions";
import { getPublicPoliceStations } from "@/lib/steadfast.functions";
import { getLastOrderByPhone } from "@/lib/customer-auth.functions";
import { collectTracking } from "@/lib/tracking";
import { useCustomerSession } from "@/lib/customer-session";
import { formatBDT } from "@/lib/format";
import { buildResponsiveImage } from "@/lib/product-image";
import { ThanaCombobox } from "@/components/admin/ThanaCombobox";

// ---------- data ----------

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
    staleTime: 2 * 60 * 1000,
  });

const variationsQueryOptions = (productId: number) =>
  queryOptions({
    queryKey: ["product-variations", productId],
    queryFn: () => getProductVariations({ data: { productId } }),
    staleTime: 5 * 60 * 1000,
  });

export const Route = createFileRoute("/step/$slug")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!res.product) throw notFound();
    if (res.product.type === "variable" && (res.product.variations?.length ?? 0) > 0) {
      void context.queryClient.prefetchQuery(variationsQueryOptions(res.product.id));
    }
    return { slug: params.slug };
  },
  head: ({ match }) => {
    const data = match.context?.queryClient.getQueryData(
      productQuery(match.params.slug).queryKey,
    ) as { product: WooProduct | null } | undefined;
    const p = data?.product;
    if (!p) return { meta: [{ title: "Order now — Zonash" }] };
    const img = p.images?.[0]?.src;
    const responsive = buildResponsiveImage(img);
    const desc =
      (p.short_description ?? "").replace(/<[^>]+>/g, "").slice(0, 155) ||
      `Order ${p.name} — Cash on delivery, nationwide.`;
    const title = `${p.name} · Order now`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "index,follow" },
        { property: "og:type", content: "product" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img } as const] : []),
        { name: "twitter:card", content: "summary_large_image" },
        ...(img ? [{ name: "twitter:image", content: img } as const] : []),
      ],
      links: responsive
        ? [
            {
              rel: "preload",
              as: "image",
              href: responsive.src,
              imagesrcset: responsive.srcSet,
              imagesizes: responsive.sizes,
              fetchpriority: "high",
            } as const,
          ]
        : [],
    };
  },
  component: StepLandingPage,
  pendingComponent: StepSkeleton,
  pendingMs: 0,
});

// ---------- form validation (mirrors /checkout) ----------

const BN_DIGITS: Record<string, string> = { "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9" };
function normalizeBdPhone(input: string): string {
  let s = (input || "").replace(/[০-৯]/g, (d) => BN_DIGITS[d] ?? d);
  s = s.replace(/\D/g, "");
  if (/^8801[3-9]\d{8}$/.test(s)) s = "0" + s.slice(3);
  return s;
}
const isValidBdPhone = (s: string) => /^01[3-9]\d{8}$/.test(s);
const isValidName = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && /\p{L}/u.test(t) && !/(.)\1{4,}/u.test(t) &&
    new Set(t.toLowerCase().split("")).size > 1;
};
const isValidAddress = (s: string) => {
  const t = s.trim();
  return t.length >= 5 && /^[\p{L}\p{N}#,\.\-\/()\s]+$/u.test(t) &&
    /\p{L}/u.test(t) && !/(.)\1{8,}/u.test(t);
};

const formSchema = z.object({
  name: z.string().max(120).refine(isValidName, "Please enter a valid full name."),
  phone: z.string().refine((v) => isValidBdPhone(normalizeBdPhone(v)), "Please enter a valid Bangladeshi mobile number (01XXXXXXXXX)."),
  address: z.string().max(300).refine(isValidAddress, "Please enter a valid delivery address."),
  thana: z.string().trim().min(1, "Please select your thana / upazila.").max(80),
});
type FormShape = z.infer<typeof formSchema>;
const EMPTY: FormShape = { name: "", phone: "", address: "", thana: "" };
const STORAGE_KEY = "zonash:step:form";
const MAX_QTY = 10;

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function priceNum(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

// ---------- page ----------

function StepLandingPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const { data: productRes } = useSuspenseQuery(productQuery(slug));
  const product = productRes.product;
  if (!product) throw notFound();

  const isVariable = product.type === "variable" && (product.variations?.length ?? 0) > 0;

  const variationsQ = useQuery({
    ...variationsQueryOptions(product.id),
    enabled: isVariable,
  });
  const variations: WooVariation[] = variationsQ.data?.variations ?? [];

  // Selected variation: first in-stock by default.
  const [selectedVarId, setSelectedVarId] = useState<number | null>(null);
  useEffect(() => {
    if (!isVariable || variations.length === 0 || selectedVarId) return;
    const firstInStock = variations.find((v) => v.stock_status !== "outofstock") ?? variations[0];
    setSelectedVarId(firstInStock?.id ?? null);
  }, [isVariable, variations, selectedVarId]);

  const selectedVar = useMemo(
    () => variations.find((v) => v.id === selectedVarId) ?? null,
    [variations, selectedVarId],
  );

  // Effective price / regular price / stock
  const effectivePrice = isVariable
    ? priceNum(selectedVar?.price ?? product.price)
    : priceNum(product.on_sale && product.sale_price ? product.sale_price : product.price);
  const effectiveRegular = isVariable
    ? priceNum(selectedVar?.regular_price ?? "")
    : priceNum(product.regular_price);
  const showStrike = effectiveRegular > effectivePrice && effectiveRegular > 0;
  const discountPct = showStrike
    ? Math.round(((effectiveRegular - effectivePrice) / effectiveRegular) * 100)
    : 0;
  const inStock = isVariable
    ? (selectedVar ? selectedVar.stock_status !== "outofstock" : false)
    : product.stock_status !== "outofstock";

  // Gallery
  const gallery = useMemo(() => {
    const list: { src: string; alt: string }[] = [];
    if (selectedVar?.image?.src) list.push({ src: selectedVar.image.src, alt: product.name });
    for (const img of product.images ?? []) {
      if (!list.some((x) => x.src === img.src)) list.push({ src: img.src, alt: img.alt || product.name });
    }
    return list;
  }, [product, selectedVar]);

  const [activeImg, setActiveImg] = useState(0);
  useEffect(() => { setActiveImg(0); }, [selectedVarId]);
  // Auto-slide (paused after user interaction)
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || gallery.length <= 1) return;
    const t = setInterval(() => setActiveImg((i) => (i + 1) % gallery.length), 3500);
    return () => clearInterval(t);
  }, [paused, gallery.length]);
  const galleryRef = useRef<HTMLDivElement>(null);
  const onGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeImg) setActiveImg(idx);
    setPaused(true);
  };

  // Highlights from short_description (strip HTML → split lines)
  const highlights = useMemo(() => {
    const raw = product.short_description ?? "";
    const text = raw.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    return text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3)
      .slice(0, 6);
  }, [product.short_description]);

  // ---------- form state ----------
  const submitFn = useServerFn(submitPendingOrder);
  const [form, setForm] = useState<FormShape>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [idem, setIdem] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  // Restore + persist
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setForm({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    router.preloadRoute({ to: "/verify-otp" }).catch(() => {});
  }, [router]);
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [form]);

  // Autofill from last order
  const policeFn = useServerFn(getPublicPoliceStations);
  const policeQ = useQuery({
    queryKey: ["checkout", "police-stations"],
    queryFn: () => policeFn(),
    staleTime: 24 * 60 * 60_000,
  });
  const { phone: sessionPhone } = useCustomerSession();
  const lastOrderFn = useServerFn(getLastOrderByPhone);
  const lastOrderQ = useQuery({
    queryKey: ["checkout", "last-order", sessionPhone],
    enabled: !!sessionPhone,
    queryFn: () => lastOrderFn({ data: { phone: sessionPhone! } }),
    staleTime: 10 * 60_000,
  });
  useEffect(() => {
    const b = lastOrderQ.data?.billing;
    if (!b) return;
    const opts = policeQ.data?.items ?? [];
    const raw = (b.thana || "").trim();
    const canonicalThana =
      raw && opts.length
        ? (opts.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? raw)
        : raw;
    setForm((f) => ({
      name: f.name || b.name || "",
      phone: f.phone || b.phone || sessionPhone || "",
      address: f.address || b.address || "",
      thana: f.thana || canonicalThana || "",
    }));
  }, [lastOrderQ.data, sessionPhone, policeQ.data?.items]);

  const update = (patch: Partial<FormShape>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const n = { ...prev };
      for (const k of Object.keys(patch)) delete n[k];
      return n;
    });
  };

  // Shipping — 80 inside Dhaka City, 130 elsewhere
  const dhakaCitySet = useMemo(
    () => new Set((policeQ.data?.dhakaCity ?? []).map((s) => s.trim().toLowerCase())),
    [policeQ.data?.dhakaCity],
  );
  const insideDhaka = form.thana.trim().length > 0 && dhakaCitySet.has(form.thana.trim().toLowerCase());
  const shipping = insideDhaka ? 80 : 130;
  const subtotal = effectivePrice * qty;
  const total = subtotal + shipping;
  const savings = showStrike ? Math.max(0, (effectiveRegular - effectivePrice) * qty) : 0;

  const orderRef = useRef<HTMLDivElement>(null);
  const scrollToOrder = () => {
    orderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (isVariable && !selectedVar) {
      toast.error("Please select an option");
      return;
    }
    if (!inStock) {
      toast.error("This option is out of stock");
      return;
    }
    const normalizedPhone = normalizeBdPhone(form.phone);
    const parsed = formSchema.safeParse({ ...form, phone: normalizedPhone });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      const firstKey = parsed.error.issues[0]?.path[0] as string | undefined;
      toast.error("Please review your details", {
        description: parsed.error.issues[0]?.message,
      });
      const el = firstKey ? document.getElementById(`step-${firstKey}`) : null;
      el?.focus?.();
      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const { first, last } = splitName(parsed.data.name);
      const tracking = await collectTracking({
        name: parsed.data.name,
        phone: parsed.data.phone,
      });
      const line = {
        product_id: product.id,
        variation_id: selectedVar?.id,
        quantity: Math.max(1, Math.min(MAX_QTY, qty)),
      };
      const res = await submitFn({
        data: {
          items: [line],
          billing: {
            first_name: first,
            last_name: last || "",
            email: "",
            phone: parsed.data.phone,
            address_1: parsed.data.address,
            address_2: "",
            city: parsed.data.thana,
            country: "BD",
          },
          shipping_amount: shipping,
          shipping_label: insideDhaka ? "Inside Dhaka" : "Outside Dhaka",
          discount: 0,
          customer_note: `Landing: ${slug}`,
          tracking,
          idempotency_key: idem,
        },
      });
      if (!res.ok) {
        toast.error(res.error || "Order failed");
        setSubmitting(false);
        return;
      }
      if (!res.sms_ok) {
        toast.message("Order created", {
          description: "We couldn't text your code — tap Resend on the next screen.",
        });
      }
      await navigate({
        to: "/verify-otp",
        search: {
          order: res.order_id,
          number: res.order_number,
          phone: res.phone_masked,
        } as never,
      });
      setIdem(
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Could not place your order. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-[92px]">
      {/* Sticky trust bar */}
      <div className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-border bg-primary text-primary-foreground py-1.5 text-[11px] font-semibold">
        <Truck className="h-3.5 w-3.5" aria-hidden />
        Cash on Delivery · All over Bangladesh
      </div>

      {/* Hero image gallery */}
      <section className="relative">
        <div
          ref={galleryRef}
          onScroll={onGalleryScroll}
          onTouchStart={() => setPaused(true)}
          onPointerDown={() => setPaused(true)}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Product images"
        >
          {gallery.length === 0 ? (
            <div className="aspect-square w-full shrink-0 bg-muted" />
          ) : (
            gallery.map((img, i) => (
              <div key={img.src + i} className="relative aspect-square w-full shrink-0 snap-start bg-muted">
                <img
                  src={img.src}
                  alt={img.alt}
                  className="h-full w-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "auto"}
                />
              </div>
            ))
          )}
        </div>
        {/* Dots */}
        {gallery.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {gallery.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeImg ? "w-4 bg-primary" : "w-1.5 bg-background/70"
                }`}
              />
            ))}
          </div>
        )}
        {discountPct > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-destructive-foreground shadow-lg">
            −{discountPct}% OFF
          </span>
        )}
        {product.on_sale && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-destructive shadow-lg">
            <Flame className="h-3 w-3" aria-hidden />
            HOT DEAL
          </span>
        )}
      </section>

      {/* Title + price */}
      <section className="bg-gradient-to-b from-primary/[0.05] via-background to-background px-4 pb-4 pt-4">
        <h1 className="text-[19px] font-bold leading-tight text-foreground">{product.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-0.5" aria-label={`Rating ${product.average_rating}`}>
            {[0,1,2,3,4].map((i) => (
              <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(parseFloat(product.average_rating) || 4.8) ? "fill-warning text-warning" : "text-muted-foreground/40"}`} aria-hidden />
            ))}
          </span>
          <span className="font-semibold text-foreground">{parseFloat(product.average_rating) > 0 ? product.average_rating : "4.8"}</span>
          <span>({product.rating_count > 0 ? product.rating_count : "1,240"}+ reviews)</span>
          <span aria-hidden>·</span>
          <span className={inStock ? "font-semibold text-success" : "font-semibold text-destructive"}>
            {inStock ? "In stock" : "Out of stock"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <span className="text-[28px] font-extrabold leading-none text-primary tabular-nums">
            {formatBDT(effectivePrice)}
          </span>
          {showStrike && (
            <>
              <span className="text-sm text-muted-foreground line-through tabular-nums">
                {formatBDT(effectiveRegular)}
              </span>
              <span className="rounded-[3px] bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                SAVE {formatBDT(effectiveRegular - effectivePrice)}
              </span>
            </>
          )}
        </div>
        {/* Urgency line */}
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-destructive">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Limited stock · Offer ends today
        </div>
      </section>

      {/* Variation cards */}
      {isVariable && variations.length > 0 && (
        <section className="px-4 pb-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Choose your pack
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {variations.map((v) => {
              const selected = v.id === selectedVarId;
              const p = priceNum(v.price);
              const r = priceNum(v.regular_price);
              const save = r > p ? r - p : 0;
              const optLabel = v.attributes?.map((a) => a.option).filter(Boolean).join(" · ") || `Option ${v.id}`;
              const oos = v.stock_status === "outofstock";
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={oos}
                  onClick={() => setSelectedVarId(v.id)}
                  className={`relative flex flex-col items-start rounded-[6px] border-2 p-2.5 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary/[0.06] shadow-[var(--shadow-glow)]"
                      : "border-border bg-background hover:border-primary/60"
                  } ${oos ? "opacity-50" : ""}`}
                >
                  {save > 0 && (
                    <span className="absolute -top-2 right-2 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground shadow">
                      Save {formatBDT(save)}
                    </span>
                  )}
                  <span className="text-[12.5px] font-bold text-foreground line-clamp-2">{optLabel}</span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-base font-extrabold text-primary tabular-nums">{formatBDT(p)}</span>
                    {r > p && (
                      <span className="text-[10.5px] text-muted-foreground line-through tabular-nums">
                        {formatBDT(r)}
                      </span>
                    )}
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                  )}
                  {oos && (
                    <span className="mt-1 text-[10px] font-semibold text-destructive">Out of stock</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Primary CTA above the fold */}
      <div className="px-4">
        <button
          type="button"
          onClick={scrollToOrder}
          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[6px] bg-gradient-to-r from-primary via-primary to-primary/90 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] transition-all active:scale-[0.99]"
        >
          <span className="absolute inset-y-0 -left-16 w-16 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[140%]" />
          Order now — {formatBDT(effectivePrice)}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Why customers love it
          </h2>
          <ul className="space-y-2">
            {highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-[6px] border border-border bg-background p-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                <span className="text-[13px] leading-snug text-foreground">{h}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Social proof */}
      <section className="mt-6 px-4">
        <div className="rounded-[8px] border border-border bg-gradient-to-b from-warning/10 to-background p-4">
          <div className="flex items-center justify-center gap-2">
            <span className="flex items-center gap-0.5" aria-hidden>
              {[0,1,2,3,4].map((i) => (
                <Star key={i} className="h-5 w-5 fill-warning text-warning" aria-hidden />
              ))}
            </span>
            <span className="text-lg font-extrabold tabular-nums">4.8</span>
          </div>
          <p className="mt-1 text-center text-[11.5px] font-semibold text-muted-foreground">
            Based on verified customer orders
          </p>
          <div className="mt-4 grid gap-3">
            {[
              { name: "Rahim, Dhaka", stars: 5, text: "Product arrived quickly and quality was better than expected. Highly recommend!" },
              { name: "Sadia, Chattogram", stars: 5, text: "Cash on delivery made it very easy. Will order again." },
              { name: "Tanvir, Sylhet", stars: 4, text: "Good product, exactly as described. Delivery was 2 days." },
            ].map((r) => (
              <figure key={r.name} className="rounded-[6px] border border-border bg-background p-3">
                <div className="flex items-center gap-1 text-warning" aria-hidden>
                  {Array.from({ length: r.stars }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
                  ))}
                </div>
                <blockquote className="mt-1.5 text-[12.5px] leading-snug text-foreground">
                  “{r.text}”
                </blockquote>
                <figcaption className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
                  — {r.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="mt-6 px-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Truck, label: "Fast delivery" },
            { icon: Undo2, label: "7-day return" },
            { icon: ShieldCheck, label: "100% Authentic" },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-1 rounded-[6px] border border-border bg-background p-3 text-center">
              <b.icon className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-[10.5px] font-semibold text-foreground">{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Frequently asked
        </h2>
        <div className="divide-y divide-border rounded-[6px] border border-border bg-background">
          {[
            { q: "How do I pay?", a: "Cash on delivery — pay only when you receive the product." },
            { q: "How long is delivery?", a: "Inside Dhaka: 1–2 days. Outside Dhaka: 2–4 days via Steadfast." },
            { q: "What if I don't like it?", a: "You can return it within 7 days as long as it's unused and in original packaging." },
            { q: "Is the product authentic?", a: "Yes, 100% authentic — sourced directly from the manufacturer." },
          ].map((f) => (
            <details key={f.q} className="group px-3 py-2.5 [&[open]>summary>svg]:rotate-180">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-foreground">{f.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" aria-hidden />
              </summary>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Order form */}
      <section ref={orderRef} id="order" className="mt-6 px-4">
        <div className="rounded-[8px] border-2 border-primary/40 bg-gradient-to-b from-primary/[0.05] to-background p-4 shadow-[var(--shadow-glow)]">
          <div className="flex items-center justify-center gap-2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
            <Lock className="h-3 w-3" aria-hidden />
            Order in 30 seconds
          </div>
          <h2 className="mt-3 text-center text-lg font-extrabold text-foreground">
            Cash on Delivery
          </h2>
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            Fill your details — we'll call to confirm.
          </p>

          <form onSubmit={onSubmit} id="step-order-form" autoComplete="on" className="mt-4 space-y-2.5">
            <Field label="Full name" error={errors.name}>
              <input
                id="step-name"
                name="name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. Rahim Uddin"
                autoComplete="name"
                className={inputCls(errors.name)}
                aria-invalid={!!errors.name || undefined}
              />
            </Field>
            <Field label="Mobile number" error={errors.phone}>
              <input
                id="step-phone"
                name="tel"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => update({ phone: normalizeBdPhone(e.target.value) })}
                placeholder="01XXXXXXXXX"
                autoComplete="tel-national"
                maxLength={11}
                className={inputCls(errors.phone)}
                aria-invalid={!!errors.phone || undefined}
              />
            </Field>
            <Field label="Full address" error={errors.address}>
              <textarea
                id="step-address"
                name="street-address"
                rows={2}
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="House / holding no, road, area, post office, district"
                autoComplete="street-address"
                maxLength={300}
                className={textareaCls(errors.address)}
                aria-invalid={!!errors.address || undefined}
              />
            </Field>
            <Field label="Thana / Upazila" error={errors.thana}>
              <ThanaCombobox
                value={form.thana}
                onChange={(v) => update({ thana: v })}
                options={policeQ.data?.items ?? []}
                grouped={policeQ.data?.grouped}
                loading={policeQ.isLoading}
                buttonClassName={`flex h-11 w-full items-center justify-between gap-2 rounded-[3px] border bg-background px-3 text-left text-sm outline-none transition-colors ${errors.thana ? "border-destructive" : "border-border focus:border-primary"}`}
              />
            </Field>

            {/* Quantity */}
            <div>
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Quantity</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-[3px] border border-border bg-background">
                  <button
                    type="button"
                    aria-label="Decrease"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="grid h-10 w-10 place-items-center text-muted-foreground active:scale-95"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center text-sm font-bold tabular-nums" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    aria-label="Increase"
                    onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                    disabled={qty >= MAX_QTY}
                    className="grid h-10 w-10 place-items-center text-primary active:scale-95 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-[11.5px] text-muted-foreground">
                  Max {MAX_QTY} per order
                </span>
              </div>
            </div>

            {/* Summary */}
            <dl className="mt-2 space-y-1.5 rounded-[6px] border border-dashed border-border bg-background p-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal ({qty})</dt>
                <dd className="tabular-nums">{formatBDT(subtotal)}</dd>
              </div>
              {savings > 0 && (
                <div className="flex justify-between text-destructive">
                  <dt>You save</dt>
                  <dd className="tabular-nums">−{formatBDT(savings)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery charge {insideDhaka ? "(Inside Dhaka)" : ""}</dt>
                <dd className="tabular-nums">{formatBDT(shipping)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-border pt-1.5">
                <dt className="text-sm font-bold">Total</dt>
                <dd className="text-lg font-extrabold text-primary tabular-nums">{formatBDT(total)}</dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={submitting || !inStock}
              className="group relative mt-2 flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-[6px] bg-gradient-to-r from-primary via-primary to-primary/90 text-base font-extrabold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] transition-all active:scale-[0.99] disabled:opacity-60"
            >
              <span className="absolute inset-y-0 -left-16 w-16 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[140%]" />
              <Lock className="h-4 w-4" aria-hidden />
              {submitting ? "Placing your order…" : `Confirm order · ${formatBDT(total)}`}
            </button>
            <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">
              No online payment · Pay when you receive
            </p>
          </form>
        </div>
      </section>

      {/* Footer link back to full store */}
      <div className="mt-6 mb-4 text-center">
        <Link to="/" className="text-[12px] font-semibold text-muted-foreground underline underline-offset-2">
          ← Back to Zonash store
        </Link>
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-x border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold text-primary tabular-nums">{formatBDT(total)}</span>
              {showStrike && (
                <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                  {formatBDT(effectiveRegular * qty + shipping)}
                </span>
              )}
            </div>
          </div>
          <button
            type="submit"
            form="step-order-form"
            disabled={submitting || !inStock}
            className="flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-[6px] bg-gradient-to-r from-primary to-primary/90 px-3 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] transition-all active:scale-[0.99] disabled:opacity-60"
          >
            <Lock className="h-4 w-4" aria-hidden />
            {submitting ? "Placing…" : "Order now"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {submitting && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          <p className="text-sm font-semibold text-foreground">Placing your order…</p>
          <p className="text-[11px] text-muted-foreground">Do not close this page</p>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-semibold text-destructive">{error}</span>}
    </label>
  );
}
function inputCls(err?: string) {
  return `h-11 w-full rounded-[3px] border bg-background px-3 text-sm outline-none transition-colors ${err ? "border-destructive" : "border-border focus:border-primary"}`;
}
function textareaCls(err?: string) {
  return `block w-full resize-none rounded-[3px] border bg-background px-3 py-2.5 text-sm leading-5 outline-none transition-colors min-h-[64px] ${err ? "border-destructive" : "border-border focus:border-primary"}`;
}

// ---------- skeleton ----------
function StepSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <div className="h-6 w-full animate-pulse bg-primary/60" />
      <div className="aspect-square w-full animate-pulse bg-muted" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 px-4">
        <div className="h-20 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded bg-muted" />
      </div>
      <div className="mx-4 mt-4 h-12 animate-pulse rounded bg-muted" />
    </div>
  );
}
