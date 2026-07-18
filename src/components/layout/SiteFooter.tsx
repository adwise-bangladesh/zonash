import { Facebook, Instagram, Youtube, MapPin, Mail, Phone, ChevronDown, ShieldCheck, Truck, RotateCcw, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const linkColumns = [
  {
    title: "Shop",
    links: [
      { label: "Rings", href: "/products?category=rings" },
      { label: "Necklaces", href: "/products?category=necklaces" },
      { label: "Earrings", href: "/products?category=earrings" },
      { label: "Bracelets", href: "/products?category=bracelets" },
      { label: "New arrivals", href: "/products" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Track order", href: "/track" },
      { label: "Returns & refunds", href: "/returns" },
      { label: "Shipping info", href: "/shipping" },
      { label: "Contact support", href: "/help" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Zonash", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
      { label: "Affiliate", href: "/affiliate" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Refund policy", href: "/legal/refunds" },
      { label: "Cookie policy", href: "/legal/cookies" },
    ],
  },
];

const payments = ["bKash", "Nagad", "Rocket", "Visa", "Mastercard", "COD"];

const perks = [
  { Icon: Truck, title: "Fast delivery", desc: "Nationwide in 1–3 days" },
  { Icon: RotateCcw, title: "7-day returns", desc: "Hassle-free policy" },
  { Icon: Wallet, title: "Cash on delivery", desc: "Pay when you receive" },
  { Icon: ShieldCheck, title: "Secure checkout", desc: "100% buyer protection" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="border-b border-border bg-background">
        <div className="container-page grid grid-cols-2 gap-3 py-5 md:grid-cols-4 md:gap-4 md:py-6">
          {perks.map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink">{title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container-page py-10 md:py-14">
        <div className="grid gap-8 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-4">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Zonash crafts modern heirloom jewelry — rings, necklaces, earrings and bracelets, delivered across Bangladesh with a two-year guarantee.
            </p>
            <div className="mt-5 space-y-2.5 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Zonash, Gulshan, Dhaka 1212, Bangladesh
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href="mailto:hello@zonash.com" className="hover:text-primary">hello@zonash.com</a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href="tel:+8809610000000" className="hover:text-primary">+880 9610 000 000</a>
              </p>
            </div>
            <div className="mt-5 flex items-center gap-2">
              {[
                { Icon: Facebook, label: "Facebook", href: "#" },
                { Icon: Instagram, label: "Instagram", href: "#" },
                { Icon: Youtube, label: "YouTube", href: "#" },
              ].map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[3px] border border-border bg-background text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-8">
            <div className="divide-y divide-border border-y border-border md:hidden">
              {linkColumns.map((col) => (
                <details key={col.title} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold text-ink">
                    {col.title}
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="pb-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <a href={l.href} className="text-sm text-muted-foreground hover:text-primary">{l.label}</a>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>

            <div className="hidden md:grid md:grid-cols-4 md:gap-8">
              {linkColumns.map((col) => (
                <div key={col.title}>
                  <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <a href={l.href} className="text-sm text-muted-foreground hover:text-primary">{l.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Zonash. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">We accept:</span>
            {payments.map((p) => (
              <span
                key={p}
                className="rounded-[3px] border border-border bg-background px-2 py-1 text-[10px] font-semibold tracking-wide text-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
