import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { getProductBySlug } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { Truck, ShieldCheck, Gem, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
  });

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!res.product) throw notFound();
    return { title: res.product.name, description: res.product.short_description?.replace(/<[^>]+>/g, "").slice(0, 160) };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.title} — Zonash` },
      { name: "description", content: loaderData.description || "Fine jewelry by Zonash." },
      { property: "og:title", content: `${loaderData.title} — Zonash` },
      { property: "og:description", content: loaderData.description || "" },
    ] : [{ title: "Product — Zonash" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: ProductNotFound,
  component: ProductDetail,
});

function ProductNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl">Not found</h1>
        <p className="mt-3 text-muted-foreground">This piece isn't available.</p>
        <Link to="/products"><Button className="mt-6">Back to shop</Button></Link>
      </div>
    </div>
  );
}

function ProductDetail() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productQuery(slug));
  const product = data.product!;
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const { add } = useCart();
  const navigate = useNavigate();

  const priceNum = parseFloat(product.sale_price && product.on_sale ? product.sale_price : product.price) || 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <nav className="mb-6 text-xs uppercase tracking-widest text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Home</Link> / <Link to="/products" className="hover:text-foreground">Shop</Link> / <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid gap-10 md:grid-cols-2">
          {/* Gallery */}
          <div>
            <div className="relative aspect-square overflow-hidden bg-muted">
              {product.images[activeImg] ? (
                <img src={product.images[activeImg].src} alt={product.images[activeImg].alt || product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center"><Gem className="h-16 w-16 text-muted-foreground/40" /></div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {product.images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImg(i)}
                    className={`aspect-square overflow-hidden bg-muted transition ${i === activeImg ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}
                  >
                    <img src={img.src} alt={img.alt || product.name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            {product.categories[0] && (
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{product.categories[0].name}</p>
            )}
            <h1 className="mt-2 font-display text-4xl md:text-5xl">{product.name}</h1>

            <div className="mt-4 flex items-baseline gap-3">
              {product.sale_price && product.on_sale ? (
                <>
                  <span className="font-display text-2xl">৳{product.sale_price}</span>
                  <span className="text-lg text-muted-foreground line-through">৳{product.regular_price}</span>
                </>
              ) : (
                <span className="font-display text-2xl">৳{product.price || "—"}</span>
              )}
            </div>

            {product.short_description && (
              <div
                className="mt-6 text-sm leading-relaxed text-muted-foreground prose prose-sm"
                dangerouslySetInnerHTML={{ __html: product.short_description }}
              />
            )}

            <div className="mt-8 flex items-center gap-3">
              <div className="flex items-center border border-border">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2 hover:bg-accent"><Minus className="h-3 w-3" /></button>
                <span className="w-10 text-center text-sm">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(99, q + 1))} className="p-2 hover:bg-accent"><Plus className="h-3 w-3" /></button>
              </div>
              <Button
                size="lg"
                className="flex-1 rounded-none"
                disabled={product.stock_status !== "instock"}
                onClick={() => {
                  add({
                    productId: product.id,
                    name: product.name,
                    slug: product.slug,
                    price: priceNum,
                    image: product.images[0]?.src,
                  }, qty);
                  toast.success("Added to cart");
                }}
              >
                {product.stock_status === "instock" ? "Add to cart" : "Sold out"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-none"
                disabled={product.stock_status !== "instock"}
                onClick={() => {
                  add({
                    productId: product.id,
                    name: product.name,
                    slug: product.slug,
                    price: priceNum,
                    image: product.images[0]?.src,
                  }, qty);
                  navigate({ to: "/checkout" });
                }}
              >
                Buy now
              </Button>
            </div>

            <div className="mt-8 space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Free insured shipping worldwide</div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Lifetime warranty & 30-day returns</div>
              <div className="flex items-center gap-2"><Gem className="h-4 w-4 text-primary" /> Ethically sourced materials</div>
            </div>

            {product.description && (
              <div className="mt-10 border-t border-border pt-8">
                <h2 className="mb-4 font-display text-xl">Details</h2>
                <div
                  className="text-sm leading-relaxed text-muted-foreground prose prose-sm"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
