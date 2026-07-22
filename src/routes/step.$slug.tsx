import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Lock,
  Sparkles,
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
import { NotFoundView } from "@/components/NotFoundView";

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
  errorComponent: ({ error, reset }) => {
    const message =
      error instanceof Error ? error.message : "Something went wrong loading this page.";
    return (
      <NotFoundView
        variant="error"
        title="Couldn't load offer"
        description={message}
        onRetry={() => reset()}
      />
    );
  },
  notFoundComponent: () => (
    <NotFoundView
      title="Offer not found"
      description="This offer may have ended or the link is incorrect."
      primaryLabel="Browse shop"
      primaryTo="/products"
    />
  ),
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
  return t.length >= 5 && /^[\p{L}\p{N}#,.\-/()\s]+$/u.test(t) &&
    /\p{L}/u.test(t) && !/(.)\1{8,}/u.test(t);
};

const formSchema = z.object({
  name: z.string().max(120).refine(isValidName, "Please enter a valid full name."),
  phone: z.string().refine((v) => isValidBdPhone(normalizeBdPhone(v)), "Please enter a valid Bangladeshi mobile number (01XXXXXXXXX)."),
  address: z.string().max(300).refine(isValidAddress, "Please enter a valid delivery address."),
  thana: z.string().trim().min(1, "Please select your thana / upazila.").max(80),
  email: z.string().trim().max(120).email("Please enter a valid email address.").optional().or(z.literal("")),
});
type FormShape = z.infer<typeof formSchema>;
const EMPTY: FormShape = { name: "", phone: "", address: "", thana: "", email: "" };

const STORAGE_KEY = "zonash:step:form";

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

/** Integer discount percent (0 when not on sale). */
function discountPercent(price: number, regular: number): number {
  if (regular <= 0 || price <= 0 || price >= regular) return 0;
  return Math.round(((regular - price) / regular) * 100);
}

/** Cryptographically-strong id with a safe fallback for older runtimes. */
function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const variations: WooVariation[] = useMemo(() => {
    const list = variationsQ.data?.variations ?? [];
    // WooCommerce merchants order variations by `menu_order` — treat the
    // lowest value as the merchant's featured / best-selling option.
    return [...list].sort((a, b) => {
      const am = a.menu_order ?? 9999;
      const bm = b.menu_order ?? 9999;
      if (am !== bm) return am - bm;
      return a.id - b.id;
    });
  }, [variationsQ.data]);

  // Best deal = in-stock variation with the largest DISCOUNT PERCENTAGE
  // (regular vs sale). Percent is the fair comparison across price tiers —
  // a 40% off 500tk item is a better deal than 10% off 5000tk.
  // Tiebreakers: larger absolute savings, then lower menu_order.
  const bestDealId = useMemo(() => {
    const inStock = variations.filter((v) => v.stock_status !== "outofstock");
    if (inStock.length === 0) return null;
    let best: (typeof inStock)[number] | null = null;
    let bestPct = 0;
    let bestSave = 0;
    for (const v of inStock) {
      const p = priceNum(v.price);
      const r = priceNum(v.regular_price);
      if (r <= 0 || p <= 0 || p >= r) continue;
      const save = r - p;
      const pct = save / r;
      if (pct > bestPct || (pct === bestPct && save > bestSave)) {
        best = v;
        bestPct = pct;
        bestSave = save;
      }
    }
    // No variation actually on sale → don't badge anything.
    return best?.id ?? null;
  }, [variations]);



  // Selected variation: bestseller by default.
  const [selectedVarId, setSelectedVarId] = useState<number | null>(null);
  useEffect(() => {
    if (!isVariable || variations.length === 0 || selectedVarId) return;
    setSelectedVarId(bestDealId ?? variations[0]?.id ?? null);
  }, [isVariable, variations, bestDealId, selectedVarId]);

  const selectedVar = useMemo(
    () => variations.find((v) => v.id === selectedVarId) ?? null,
    [variations, selectedVarId],
  );

  // Section title: use the variation attribute name (e.g. "Size", "Color").
  const variationHeading = useMemo(() => {
    const name = variations[0]?.attributes?.[0]?.name?.trim();
    return name ? `Choose your ${name.toLowerCase()}` : "Choose your option";
  }, [variations]);


  // Effective price / regular price / stock
  const effectivePrice = isVariable
    ? priceNum(selectedVar?.price ?? product.price)
    : priceNum(product.on_sale && product.sale_price ? product.sale_price : product.price);
  const effectiveRegular = isVariable
    ? priceNum(selectedVar?.regular_price ?? "")
    : priceNum(product.regular_price);
  const showStrike = effectiveRegular > effectivePrice && effectiveRegular > 0;

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
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setActiveImg((i) => (i + 1) % gallery.length);
    }, 3500);
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
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [showSummary, setShowSummary] = useState(false);


  // ---------- form state ----------
  const submitFn = useServerFn(submitPendingOrder);
  const [form, setForm] = useState<FormShape>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [idem, setIdem] = useState(genId);


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
      email: f.email || b.email || "",
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
  const subtotal = effectivePrice;
  const total = subtotal + shipping;
  const savings = showStrike ? Math.max(0, effectiveRegular - effectivePrice) : 0;

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
        email: parsed.data.email || undefined,
      });
      const line = {
        product_id: product.id,
        variation_id: selectedVar?.id,
        quantity: 1,
      };
      const res = await submitFn({
        data: {
          items: [line],
          billing: {
            first_name: first,
            last_name: last || "",
            email: parsed.data.email || "",
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
      setIdem(genId());

    } catch (err) {
      console.error(err);
      toast.error("Could not place your order. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-6">
      {/* Sticky trust bar */}
      <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-1.5 text-[11px] font-semibold">
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
      </section>

      {/* Title + price */}
      <section className="bg-gradient-to-b from-primary/[0.05] via-background to-background px-4 pb-4 pt-4">
        <h1 className="text-[19px] font-bold leading-tight text-foreground">{product.name}</h1>
        {(selectedVar?.sku || product.sku) && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">
              SKU: <span className="font-mono text-foreground/80">{selectedVar?.sku || product.sku}</span>
            </div>
            <CountdownInline />
          </div>
        )}

        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-0.5" aria-label={`Rating ${product.average_rating}`}>
            {[0,1,2,3,4].map((i) => (
              <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(parseFloat(product.average_rating) || 4.8) ? "fill-warning text-warning" : "text-muted-foreground/40"}`} aria-hidden />
            ))}
          </span>
          <span className="font-semibold text-foreground">{parseFloat(product.average_rating) > 0 ? product.average_rating : "4.8"}</span>
          <span>({(product.rating_count > 0 ? product.rating_count : fakeReviewCount(slug)).toLocaleString()}+ reviews)</span>
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
      </section>



      {/* Variation cards — compact left-aligned, matches product page style */}
      {isVariable && variations.length > 0 && (
        <section className="px-4 pb-2 pt-1">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-px w-6 bg-primary/40" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {variationHeading}
            </span>
            {selectedVar && (
              <span className="ml-auto text-[11px] font-semibold text-primary">
                {selectedVar.attributes.map((a) => a.option).join(" / ")}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {variations.map((v) => {
              const active = v.id === selectedVarId;
              const p = priceNum(v.price);
              const r = priceNum(v.regular_price);
              const save = r > p ? r - p : 0;
              const pct = discountPercent(p, r);
              const optLabel =
                v.attributes?.map((a) => a.option).filter(Boolean).join(" · ") || `Option ${v.id}`;
              const oos = v.stock_status === "outofstock";
              const isBestDeal = v.id === bestDealId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVarId(v.id)}
                  disabled={oos}
                  aria-pressed={active}
                  className={`group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all ${
                    active
                      ? "border-primary bg-background shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.35)] ring-1 ring-primary"
                      : oos
                        ? "border-dashed border-border bg-muted/30 opacity-60"
                        : "border-border bg-background hover:border-primary/50 hover:shadow-sm"
                  }`}
                >
                  {pct > 0 && !oos && (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-primary-foreground shadow-sm">
                      −{pct}%
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full border transition-colors ${
                        active ? "border-primary bg-primary" : "border-border bg-background"
                      }`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                    </span>
                    <span
                      className={`text-[13px] font-bold leading-tight ${
                        oos ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {optLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 pl-[22px]">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[14px] font-extrabold leading-none text-primary tabular-nums">
                        {formatBDT(p)}
                      </span>
                      {save > 0 && (
                        <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                          {formatBDT(r)}
                        </span>
                      )}
                    </div>
                    {save > 0 && !oos && (
                      <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-success">
                        <span>Save {formatBDT(save)}</span>
                        {isBestDeal && (
                          <span className="rounded-md bg-destructive px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-destructive-foreground shadow-sm">
                            Best deal
                          </span>
                        )}
                      </p>
                    )}
                    {oos && (
                      <p className="mt-1 text-[10px] font-medium text-muted-foreground">Out of stock</p>
                    )}
                  </div>

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

      {/* Why customers love it */}
      {highlights.length > 0 && (
        <section className="mt-7 px-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Why customers love it
            </h2>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border" />
          </div>
          <div
            className={`relative overflow-hidden transition-[max-height] duration-500 ease-out ${
              showAllHighlights || highlights.length <= 3 ? "max-h-[999px]" : "max-h-[168px]"
            }`}
          >
            <ul className="grid gap-2">
              {highlights.map((h, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-3 rounded-[8px] border border-border/70 bg-gradient-to-br from-primary/[0.04] via-background to-background p-3 transition-colors hover:border-primary/40"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  <span className="text-[13.5px] font-medium leading-snug text-foreground">
                    {h}
                  </span>
                </li>
              ))}
            </ul>
            {highlights.length > 3 && !showAllHighlights && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/90 to-transparent" />
            )}
          </div>
          {highlights.length > 3 && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllHighlights((v) => !v)}
                aria-expanded={showAllHighlights}
                className="group grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-primary shadow-sm transition-all hover:border-primary/60 hover:shadow-md active:scale-95"
                aria-label={showAllHighlights ? "Show less" : "Show more"}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 ${showAllHighlights ? "rotate-180" : ""}`}
                  strokeWidth={2.5}
                  aria-hidden
                />
              </button>
            </div>
          )}
        </section>
      )}


      {/* Social proof */}
      <section className="mt-4 px-4">
        <ReviewsCarousel slug={slug} />
      </section>


      {/* Trust badges */}
      <section className="mt-6 px-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Truck, label: "Fast delivery" },
            { icon: Undo2, label: "Instant return" },
            { icon: ShieldCheck, label: "100% Authentic" },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-1 rounded-[6px] border border-border bg-background p-3 text-center">
              <b.icon className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-[10.5px] font-semibold text-foreground">{b.label}</span>
            </div>
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
            Fill your details to place your order.
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
            <Field label="Email (optional)" error={errors.email}>
              <input
                name="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => update({ email: e.target.value })}
                className={inputCls(errors.email)}
                aria-invalid={!!errors.email || undefined}
                autoComplete="email"
                placeholder="name@example.com"
              />
            </Field>


            {/* Summary — collapsible to keep the form compact */}
            <div className="mt-2 overflow-hidden rounded-[6px] border border-dashed border-border bg-background">
              <button
                type="button"
                onClick={() => setShowSummary((v) => !v)}
                aria-expanded={showSummary}
                aria-controls="step-order-summary"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold text-foreground">Total</span>
                  <span className="text-base font-extrabold text-primary tabular-nums">
                    {formatBDT(total)}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  {showSummary ? "Hide" : "Details"}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-300 ${showSummary ? "rotate-180" : ""}`}
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </span>
              </button>
              <div
                id="step-order-summary"
                className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
                  showSummary ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0">
                  <dl className="space-y-1.5 border-t border-dashed border-border px-3 py-2.5 text-[13px]">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Subtotal</dt>
                      <dd className="tabular-nums">{formatBDT(subtotal)}</dd>
                    </div>
                    {savings > 0 && (
                      <div className="flex justify-between text-success">
                        <dt>You save</dt>
                        <dd className="tabular-nums">−{formatBDT(savings)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        Delivery charge {insideDhaka ? "(Inside Dhaka)" : "(Outside Dhaka)"}
                      </dt>
                      <dd className="tabular-nums">{formatBDT(shipping)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-border pt-1.5 font-bold">
                      <dt>Total payable</dt>
                      <dd className="tabular-nums text-primary">{formatBDT(total)}</dd>
                    </div>
                  </dl>
                  <ul className="space-y-1 border-t border-dashed border-border px-3 py-2.5 text-[11.5px] text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>Delivery in {insideDhaka ? "1 day (Dhaka)" : "2–3 days (Nationwide)"}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>Cash on Delivery · No online payment</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Undo2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>Instant return if product is damaged</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>100% authentic · Quality checked before ship</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>


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

      {/* Alternate order channels */}
      <section className="mt-8 px-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Or order directly
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Talk to us — we'll place the order for you
        </p>
        <div className="mt-3 space-y-2.5">
          <a
            href="tel:+8801926644575"
            className="group relative flex items-center gap-3 overflow-hidden rounded-[8px] border border-primary/25 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent px-4 py-3 transition-all hover:border-primary hover:shadow-[var(--shadow-card)] active:scale-[0.99]"
            aria-label="Call to order"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/10">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
                <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                Call to order
              </div>
              <div className="text-[15px] font-extrabold tabular-nums text-foreground">
                01926 644 575
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-primary/60 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </a>
          <a
            href={`https://wa.me/8801926644575?text=${encodeURIComponent(
              `Hi Zonash, I'd like to order:\n\n${product.name}${selectedVar ? ` — ${selectedVar.attributes.map((a) => a.option).join(" / ")}` : ""}\nPrice: ${formatBDT(effectivePrice)}\n\nLink: ${product.permalink}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-3 overflow-hidden rounded-[8px] border border-[#25D366]/30 bg-gradient-to-r from-[#25D366]/[0.10] via-[#25D366]/[0.04] to-transparent px-4 py-3 transition-all hover:border-[#25D366] hover:shadow-[var(--shadow-card)] active:scale-[0.99]"
            aria-label="Order on WhatsApp"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm ring-4 ring-[#25D366]/15">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" fillRule="evenodd" clipRule="evenodd" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#128C7E]">
                Order on WhatsApp
              </div>
              <div className="text-[15px] font-extrabold text-foreground">
                Chat with us instantly
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[#128C7E]/70 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </a>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10.5px] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Daily 10am – 10pm · Cash on Delivery
        </p>
      </section>

      {/* Footer link back to full store */}
      <div className="mt-6 mb-4 text-center">
        <Link to="/" className="text-[12px] font-semibold text-muted-foreground underline underline-offset-2">
          ← Back to Zonash store
        </Link>
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

// ---------- Countdown (4h per session) ----------
const COUNTDOWN_KEY = "zonash:step:offerEndsAt";
const COUNTDOWN_MS = 4 * 60 * 60 * 1000;

function CountdownInline() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let endsAt: number;
    try {
      const raw = sessionStorage.getItem(COUNTDOWN_KEY);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        endsAt = parsed;
      } else {
        endsAt = Date.now() + COUNTDOWN_MS;
        sessionStorage.setItem(COUNTDOWN_KEY, String(endsAt));
      }
    } catch {
      endsAt = Date.now() + COUNTDOWN_MS;
    }
    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    tick();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      tick();
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const ms = remaining ?? COUNTDOWN_MS;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive tabular-nums"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}





// ---------- Fake but deterministic social reviews ----------
// A pool of 40 generic reviews with a social source. For each product we
// deterministically pick 20 (based on the slug) and show a 2-per-page slider.
type ReviewSource = "facebook" | "messenger" | "whatsapp" | "tiktok" | "instagram";
type FakeReview = { name: string; city: string; stars: number; text: string; source: ReviewSource; days: number };

const REVIEW_POOL: FakeReview[] = [
  { name: "Rahim Uddin", city: "Dhaka", stars: 5, text: "Product ta hate paisi, quality onek valo. Cash on delivery te easy holo.", source: "facebook", days: 2 },
  { name: "Sadia Akter", city: "Chattogram", stars: 5, text: "Packaging neat, exactly picture er moto. Highly recommended!", source: "instagram", days: 4 },
  { name: "Tanvir Hasan", city: "Sylhet", stars: 4, text: "Good product, delivery was 2 days. Support team was helpful.", source: "messenger", days: 7 },
  { name: "Nusrat Jahan", city: "Khulna", stars: 5, text: "Onek shundor lagse. Price er tulonai quality osadharon.", source: "facebook", days: 3 },
  { name: "Imran Hossain", city: "Rajshahi", stars: 5, text: "Fast delivery and genuine product. Will order again inshaAllah.", source: "whatsapp", days: 5 },
  { name: "Mitu Rahman", city: "Dhaka", stars: 5, text: "Bou er jonno nisilam, khub khushi hoye gese. Thanks Zonash!", source: "facebook", days: 1 },
  { name: "Arif Chowdhury", city: "Cumilla", stars: 4, text: "Overall satisfied. Item description er sathe 100% match.", source: "messenger", days: 6 },
  { name: "Shirin Sultana", city: "Barishal", stars: 5, text: "Really loved the finish. Amar friend ra o order dise ekhon.", source: "instagram", days: 9 },
  { name: "Kamrul Islam", city: "Rangpur", stars: 5, text: "Value for money. Delivery man was polite, COD process shohoj.", source: "whatsapp", days: 4 },
  { name: "Fahmida Nabila", city: "Dhaka", stars: 5, text: "Just wow! Gift dilam mommy ke, uni khub pochondo korchen.", source: "tiktok", days: 2 },
  { name: "Sabbir Ahmed", city: "Narayanganj", stars: 5, text: "Product genuine, seller trustworthy. 10/10 experience.", source: "facebook", days: 8 },
  { name: "Runa Laila", city: "Mymensingh", stars: 4, text: "Delivery slightly late but product perfect. Overall bhalo laglo.", source: "messenger", days: 10 },
  { name: "Jahid Hasan", city: "Bogura", stars: 5, text: "Ekdom original jinis. Amazon er cheye bhalo experience.", source: "whatsapp", days: 3 },
  { name: "Rezaul Karim", city: "Gazipur", stars: 5, text: "Order kore 24 ghontar moddhe hate paisi. Impressive!", source: "facebook", days: 1 },
  { name: "Tania Sharmin", city: "Dhaka", stars: 5, text: "Instagram ads e dekhesilam. Real product, quality legit.", source: "instagram", days: 5 },
  { name: "Mahmud Alam", city: "Feni", stars: 4, text: "Nice packaging, product ok. Support khub friendly chilo.", source: "messenger", days: 11 },
  { name: "Sumaiya Islam", city: "Chattogram", stars: 5, text: "Sob theke boro kotha — jinis ta original. Thank you brand!", source: "facebook", days: 6 },
  { name: "Rakib Uddin", city: "Tangail", stars: 5, text: "Value onek beshi payment er tulonai. Definitely repeat customer.", source: "whatsapp", days: 4 },
  { name: "Ayesha Siddika", city: "Dhaka", stars: 5, text: "Tiktok e dekhe order dilam, honestly khub e valo lagse.", source: "tiktok", days: 2 },
  { name: "Habib Rahman", city: "Jessore", stars: 5, text: "Delivery timely, product superb. Recommended to my whole family.", source: "facebook", days: 7 },
  { name: "Nadia Afrin", city: "Dhaka", stars: 5, text: "Photo r sathe hubohu mile geche. Onek khushi ami.", source: "instagram", days: 3 },
  { name: "Shakil Ahmed", city: "Narsingdi", stars: 4, text: "Product bhalo, price o okay. Genuine seller er kase order dilam.", source: "messenger", days: 8 },
  { name: "Farzana Yasmin", city: "Chattogram", stars: 5, text: "Bou khub khushi. Ei rokom quality Bangladesh e rare.", source: "whatsapp", days: 5 },
  { name: "Mostafizur Rahman", city: "Dhaka", stars: 5, text: "Support responded within 10 minutes. COD very smooth.", source: "facebook", days: 2 },
  { name: "Rupa Khatun", city: "Kishoreganj", stars: 5, text: "Ma ke gift dilam, uni onek proud. Ashite kotha bola shohoj.", source: "messenger", days: 9 },
  { name: "Ibrahim Khalil", city: "Sylhet", stars: 5, text: "Trusted brand, next order er jonno wait korchi.", source: "facebook", days: 4 },
  { name: "Marzia Akter", city: "Dhaka", stars: 5, text: "Really beautiful product. Insta reel e dekhesilam.", source: "instagram", days: 3 },
  { name: "Ashraf Ali", city: "Chandpur", stars: 4, text: "Good product overall. Slight box damage chilo but item safe.", source: "whatsapp", days: 6 },
  { name: "Nazmul Hoque", city: "Dhaka", stars: 5, text: "Genuine 100%. Fake er tension nai ei brand er sathe.", source: "facebook", days: 1 },
  { name: "Salma Begum", city: "Barishal", stars: 5, text: "Buri ma-e o pochondo korchen. Thanks for the fast service.", source: "messenger", days: 10 },
  { name: "Ridoy Sarker", city: "Rajshahi", stars: 5, text: "Tiktok video real, jinis exact same delivery paisi.", source: "tiktok", days: 5 },
  { name: "Farhana Islam", city: "Dhaka", stars: 5, text: "Ei brand er quality e amake surprise diyese, worth every taka.", source: "instagram", days: 2 },
  { name: "Tanjina Rahman", city: "Cox's Bazar", stars: 4, text: "Bhalo item, delivery 3 din. Support khub caring chilo.", source: "whatsapp", days: 8 },
  { name: "Faridul Islam", city: "Dinajpur", stars: 5, text: "Rural area teo delivery correct time e paisi. Kudos!", source: "facebook", days: 4 },
  { name: "Rima Akter", city: "Dhaka", stars: 5, text: "Bhai amake bolse original ki na. Yes 100% original.", source: "messenger", days: 3 },
  { name: "Sohel Rana", city: "Pabna", stars: 5, text: "Family er sobai khushi. Photo pathaite bollam friends re o.", source: "whatsapp", days: 6 },
  { name: "Munni Khatun", city: "Dhaka", stars: 5, text: "Insta te scroll kore paisilam, no regrets at all.", source: "instagram", days: 2 },
  { name: "Zahidul Alam", city: "Noakhali", stars: 5, text: "Cash on delivery mane confidence. Thanks Zonash team.", source: "facebook", days: 7 },
  { name: "Sharmin Sultana", city: "Dhaka", stars: 4, text: "Onek shundor pack korchen. Uphaar hisebe dilam bou ke.", source: "messenger", days: 5 },
  { name: "Nayeem Hasan", city: "Bogura", stars: 5, text: "Tiktok ads e boishesh trust hoyese, real product paisi.", source: "tiktok", days: 3 },
];

function hashSlug(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

function fakeReviewCount(slug: string): number {
  // Deterministic count between 340 – 2800 per slug.
  return 340 + (hashSlug(slug) % 2461);
}

function pickReviewsForSlug(slug: string, count = 20): FakeReview[] {
  const seed = hashSlug(slug);
  const indices = REVIEW_POOL.map((_, i) => i);
  // Fisher-Yates with seeded LCG for stability.
  let state = seed || 1;
  for (let i = indices.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map((i) => REVIEW_POOL[i]);
}

const SOURCE_META: Record<ReviewSource, { label: string; color: string; bg: string; icon: string }> = {
  facebook:  { label: "Facebook",  color: "#1877F2", bg: "#1877F215", icon: "M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5h1.65V4.6c-.29-.04-1.27-.13-2.42-.13-2.4 0-4.05 1.47-4.05 4.16v2.27H7.5V14h2.73v8h3.27z" },
  messenger: { label: "Messenger", color: "#0084FF", bg: "#0084FF15", icon: "M12 2C6.48 2 2 6.14 2 11.25c0 2.88 1.42 5.44 3.66 7.15V22l3.34-1.84c.9.25 1.85.39 2.83.39C17.52 20.55 22 16.4 22 11.3 22 6.14 17.52 2 12 2zm1.06 12.32l-2.53-2.7-4.94 2.7 5.44-5.77 2.6 2.7 4.88-2.7-5.45 5.77z" },
  whatsapp:  { label: "WhatsApp",  color: "#25D366", bg: "#25D36615", icon: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487 2.981 1.287 2.981.858 3.518.804.537-.055 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.06L2 22l5.06-1.32A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" },
  tiktok:    { label: "TikTok",    color: "#000000", bg: "#00000010", icon: "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.68a8.16 8.16 0 0 0 4.77 1.52V6.75a4.85 4.85 0 0 1-1.84-.06z" },
  instagram: { label: "Instagram", color: "#E4405F", bg: "#E4405F15", icon: "M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 2.16c-3.14 0-3.51.01-4.75.07-.99.05-1.53.21-1.89.35-.47.18-.81.4-1.16.76-.36.36-.58.69-.76 1.16-.14.36-.3.9-.35 1.89-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05.99.21 1.53.35 1.89.18.47.4.81.76 1.16.36.36.69.58 1.16.76.36.14.9.3 1.89.35 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c.99-.05 1.53-.21 1.89-.35.47-.18.81-.4 1.16-.76.36-.36.58-.69.76-1.16.14-.36.3-.9.35-1.89.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-.99-.21-1.53-.35-1.89a3.11 3.11 0 0 0-.76-1.16 3.11 3.11 0 0 0-1.16-.76c-.36-.14-.9-.3-1.89-.35-1.24-.06-1.61-.07-4.75-.07zm0 3.68a3.96 3.96 0 1 1 0 7.92 3.96 3.96 0 0 1 0-7.92zm0 2.16a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm5.04-2.4a.96.96 0 1 1-1.92 0 .96.96 0 0 1 1.92 0z" },
};

function ReviewsCarousel({ slug }: { slug: string }) {
  const reviews = useMemo(() => pickReviewsForSlug(slug, 20), [slug]);
  const pages = Math.ceil(reviews.length / 2);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setPage((p) => (p + 1) % pages);
    }, 4500);
    return () => clearInterval(t);
  }, [paused, pages]);
  const totalCount = fakeReviewCount(slug);
  const visible = reviews.slice(page * 2, page * 2 + 2);
  return (
    <div
      className="overflow-hidden rounded-[8px] border border-border bg-card/70 p-3 shadow-sm"
      onPointerDown={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[18px] font-extrabold leading-none tabular-nums text-foreground">4.8</span>
            <span className="flex items-center gap-0.5" aria-hidden>
              {[0,1,2,3,4].map((k) => (
                <Star key={k} className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
              ))}
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] font-semibold text-muted-foreground">
            {totalCount.toLocaleString()} happy customers
          </p>
        </div>
        <div className="rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Social proof</p>
          <div className="mt-1 flex justify-end -space-x-1" aria-hidden>
            {(Object.keys(SOURCE_META) as ReviewSource[]).map((source) => {
              const meta = SOURCE_META[source];
              return (
                <span
                  key={source}
                  className="grid h-5 w-5 place-items-center rounded-full border border-background"
                  style={{ backgroundColor: meta.bg, color: meta.color }}
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                    <path d={meta.icon} />
                  </svg>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 min-h-[168px] overflow-hidden rounded-[7px] border border-border bg-background">
        {visible.map((r, k) => {
          const meta = SOURCE_META[r.source];
          const initials = r.name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("");
          return (
            <figure
              key={`${page}-${k}`}
              className="animate-fade-in grid h-[84px] grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border p-2.5 last:border-b-0"
            >
              <div className="relative grid h-8.5 w-8.5 place-items-center rounded-full bg-secondary text-[11px] font-extrabold text-secondary-foreground">
                {initials}
                <span
                  className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border border-background"
                  style={{ backgroundColor: meta.bg, color: meta.color }}
                  aria-label={`via ${meta.label}`}
                >
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
                    <path d={meta.icon} />
                  </svg>
                </span>
              </div>
              <div className="min-w-0">
                <figcaption className="flex items-center gap-1.5 text-[11px] leading-none">
                  <span className="truncate font-bold text-foreground">{r.name}</span>
                  <span className="shrink-0 text-muted-foreground">· {r.city}</span>
                </figcaption>
                <blockquote className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-foreground/90">
                  “{r.text}”
                </blockquote>
              </div>
              <div className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5 text-warning" aria-hidden>
                  {Array.from({ length: r.stars }).map((_, i) => (
                    <Star key={i} className="h-2.5 w-2.5 fill-warning text-warning" />
                  ))}
                </span>
                <span className="whitespace-nowrap">{r.days}d ago</span>
              </div>
            </figure>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold text-muted-foreground tabular-nums">
          {page + 1}/{pages}
        </span>
        <div className="flex flex-1 items-center gap-1" role="tablist" aria-label="Reviews">
        {Array.from({ length: pages }).map((_, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === page}
            aria-label={`Reviews page ${k + 1}`}
            onClick={() => setPage(k)}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              k === page ? "bg-primary" : "bg-muted hover:bg-muted-foreground/30"
            }`}
          />
        ))}
        </div>
      </div>
    </div>
  );
}


