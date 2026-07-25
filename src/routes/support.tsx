import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronDown,
  RotateCcw,
  Truck,
  ShieldCheck,
  Banknote,
  Phone,
  Mail,
  Clock,
  ChevronRight,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

const SUPPORT_TEL = "+8801926644575";
const SUPPORT_WA = "8801926644575";
const SUPPORT_EMAIL = "support@zonash.com";
const WA_HREF =
  "https://wa.me/message/5KU5H7MSJ6DZH1?text=Hi%20Zonash%2C%20I%20need%20help%20with%20my%20order.";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & Support · Zonash" },
      {
        name: "description",
        content:
          "Track an order, check delivery times, returns and exchange rules, or talk to the Zonash team on WhatsApp, phone or email.",
      },
      { property: "og:title", content: "Help & Support · Zonash" },
      {
        property: "og:description",
        content: "Order tracking, delivery, returns and direct contact with the Zonash team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://zonash.lovable.app/support" }],
  }),
  component: Support,
});

const FAQS: { q: string; a: string }[] = [
  {
    q: "How long does delivery take?",
    a: "Inside Dhaka: 1–2 working days. Outside Dhaka: 3–5 working days. You get an SMS with the tracking (consignment) number once your parcel is handed to the courier.",
  },
  {
    q: "What are the delivery charges?",
    a: "Inside Dhaka ৳80. Anywhere outside Dhaka ৳130. The exact charge is always shown on the checkout page before you place the order.",
  },
  {
    q: "Can I return or exchange a product?",
    a: "Yes — 7-day exchange on unworn pieces in their original packaging. Open the parcel in front of the delivery person; if anything is damaged or wrong, refuse it or call us the same day.",
  },
  {
    q: "How do I confirm my order?",
    a: "After you place an order we send a 4-digit code by SMS. Enter it on the verification screen and your order moves from pending to confirmed automatically.",
  },
  {
    q: "Is the jewelry skin-safe?",
    a: "Yes. Every piece is hypoallergenic, nickel-free and water resistant for daily wear.",
  },
  {
    q: "Can I pay online?",
    a: "Cash on delivery is available across Bangladesh. For advance payment (bKash/Nagad), just message us on WhatsApp and we will share the details.",
  },
];

function Support() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Help & Support" />

      <main className="flex-1 px-3 pb-10 pt-3">
        {/* Hero */}
        <section className="rounded-2xl bg-primary px-4 py-5 text-primary-foreground shadow-sm">
          <h2 className="font-display text-lg font-bold leading-tight">
            How can we help you?
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-primary-foreground/85">
            Our team replies within minutes — daily 10:00 AM to 10:00 PM.
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={WA_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2 text-[13px] font-semibold text-white active:scale-[0.98] transition-transform"
            >
              <WhatsAppIcon className="h-4 w-4" />
              WhatsApp
            </a>
            <a
              href={`tel:${SUPPORT_TEL}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary-foreground px-3 py-2 text-[13px] font-semibold text-primary active:scale-[0.98] transition-transform"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call now
            </a>
          </div>
        </section>

        {/* Shop promise */}
        <h3 className="mt-5 px-1 text-[13px] font-semibold">Shop with confidence</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <InfoTile icon={Banknote} label="Cash on delivery" hint="Pay only when you receive" />
          <InfoTile icon={Truck} label="Fast delivery" hint="1–2 days Dhaka · 3–5 outside" />
          <InfoTile icon={RotateCcw} label="Instant Return" hint="7 days on unworn items" />
          <InfoTile icon={ShieldCheck} label="Skin-safe wear" hint="Nickel-free & waterproof" />
        </div>

        {/* FAQ */}
        <h3 className="mt-6 px-1 text-[13px] font-semibold">Frequently asked</h3>
        <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={i > 0 ? "border-t border-border" : undefined}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
                >
                  <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{f.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <p className="overflow-hidden px-3.5 pb-3 text-[12px] leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* WhatsApp CTA */}
        <a
          href={WA_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center gap-3 rounded-2xl bg-[#25D366]/10 px-4 py-4 ring-1 ring-[#25D366]/25 active:scale-[0.99] transition-transform"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-white">
            <WhatsAppIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[#128C7E]">Chat on WhatsApp</div>
            <div className="text-[12px] text-[#128C7E]/80">Replies within minutes · 10 AM – 10 PM</div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#128C7E]" aria-hidden="true" />
        </a>

        {/* Contact list */}
        <h3 className="mt-6 px-1 text-[13px] font-semibold">Contact us</h3>
        <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">
          <ContactRow
            href={`tel:${SUPPORT_TEL}`}
            icon={Phone}
            title="Hotline"
            value="+880 1926 644575"
          />
          <ContactRow
            href={WA_HREF}
            icon={WhatsAppIcon}
            title="WhatsApp"
            value="Chat with an agent"
            external
          />
          <ContactRow
            href={`mailto:${SUPPORT_EMAIL}`}
            icon={Mail}
            title="Email"
            value={SUPPORT_EMAIL}
          />
          <div className="flex items-center gap-3 border-t border-border px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium">Support hours</div>
              <div className="text-[12px] text-muted-foreground">Every day · 10:00 AM – 10:00 PM</div>
            </div>
          </div>
        </div>

        <Link
          to="/products"
          className="mt-6 flex h-11 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground active:scale-[0.99] transition-transform"
        >
          Continue shopping
        </Link>
      </main>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Banknote;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <div className="mt-2 text-[13px] font-semibold leading-snug">{label}</div>
      <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>
    </div>
  );
}

function ContactRow({
  href,
  icon: Icon,
  title,
  value,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0 active:bg-muted/60"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="truncate text-[12px] text-muted-foreground">{value}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}
