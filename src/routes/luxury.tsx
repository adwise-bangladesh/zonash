import { createFileRoute, Link } from "@tanstack/react-router";
import { Gem, ChevronRight } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";

const CANONICAL = "https://zonash.lovable.app/luxury";
const WA_HREF = `https://wa.me/8801926644575?text=${encodeURIComponent(
  "Hi Zonash, please notify me when the Luxury Edit launches.",
)}`;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export const Route = createFileRoute("/luxury")({
  head: () => ({
    meta: [
      { title: "The Luxury Edit · Coming Soon · Zonash" },
      {
        name: "description",
        content:
          "The Zonash Luxury Edit is on its way — a curated selection of hand-finished, limited-edition pieces. Get notified at launch.",
      },
      { property: "og:title", content: "The Luxury Edit · Coming Soon · Zonash" },
      {
        property: "og:description",
        content: "A curated selection of hand-finished, limited-edition Zonash pieces. Launching soon.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: LuxuryComingSoon,
});

function LuxuryComingSoon() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="The Luxury Edit" />

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-3 pb-24 pt-3">
        <section className="overflow-hidden rounded-2xl bg-primary px-5 py-10 text-center text-primary-foreground shadow-card">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold text-gold-foreground">
            <Gem className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="mt-4 inline-block rounded-full bg-primary-foreground/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
            Coming soon
          </span>
          <h1 className="mt-3 font-display text-[22px] font-semibold leading-tight">
            The Luxury Edit
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[12px] leading-relaxed text-primary-foreground/80">
            A curated collection of hand-finished, limited-edition pieces. We are putting the final
            touches on it — it will be worth the wait.
          </p>
        </section>

        <a
          href={WA_HREF}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get notified on WhatsApp when the Luxury Edit launches (opens in a new tab)"
          className={`mt-4 flex items-center gap-3 rounded-2xl bg-[#25D366]/10 px-4 py-4 ring-1 ring-[#25D366]/25 transition-transform active:scale-[0.99] ${focusRing}`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-white">
            <WhatsAppIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[13px] font-semibold text-[#128C7E]">Notify me at launch</span>
            <span className="block text-[12px] text-[#128C7E]/80">
              Message us and we&apos;ll tell you first
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#128C7E]" aria-hidden="true" />
        </a>

        <Link
          to="/products"
          preload="intent"
          className={`mt-3 flex h-11 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.99] ${focusRing}`}
        >
          Browse the shop
        </Link>
        <Link
          to="/categories"
          preload="intent"
          className={`mt-2 flex h-11 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground transition-transform active:scale-[0.99] ${focusRing}`}
        >
          Explore categories
        </Link>
      </main>
    </div>
  );
}
