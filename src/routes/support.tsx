import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Phone, Mail, MessageCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support · Zonash" },
      { name: "description", content: "Get help with your Zonash order — contact our team by phone, email, or WhatsApp." },
    ],
  }),
  component: Support,
});

function Support() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container-page py-10 md:py-14">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">We're here to help</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">Support</h1>
          <p className="mt-3 text-muted-foreground">
            Questions about an order, shipping, or a piece you're eyeing? Reach out — we typically reply within a few hours.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a href="tel:+8809610000000" className="flex items-start gap-3 rounded-[3px] border border-border bg-card p-4 hover:border-primary">
              <Phone className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">Call us</div>
                <div className="text-sm text-muted-foreground">+880 9610 000 000</div>
              </div>
            </a>
            <a href="https://wa.me/8809610000000" className="flex items-start gap-3 rounded-[3px] border border-border bg-card p-4 hover:border-primary">
              <MessageCircle className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">WhatsApp</div>
                <div className="text-sm text-muted-foreground">Chat with our team</div>
              </div>
            </a>
            <a href="mailto:support@zonash.com" className="flex items-start gap-3 rounded-[3px] border border-border bg-card p-4 hover:border-primary">
              <Mail className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">Email</div>
                <div className="text-sm text-muted-foreground">support@zonash.com</div>
              </div>
            </a>
            <div className="flex items-start gap-3 rounded-[3px] border border-border bg-card p-4">
              <Clock className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">Hours</div>
                <div className="text-sm text-muted-foreground">Sat–Thu · 10:00–20:00 (GMT+6)</div>
              </div>
            </div>
          </div>

          <div className="mt-10">
            <h2 className="font-display text-2xl">Common questions</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="font-semibold">How long does delivery take?</div>
                <p className="text-muted-foreground">Inside Dhaka: 1–2 days. Outside Dhaka: 3–5 days.</p>
              </div>
              <div>
                <div className="font-semibold">What's your return policy?</div>
                <p className="text-muted-foreground">7-day exchange on unworn pieces in original packaging.</p>
              </div>
              <div>
                <div className="font-semibold">Is the jewelry skin-safe?</div>
                <p className="text-muted-foreground">Yes — hypoallergenic, waterproof, and nickel-free.</p>
              </div>
            </div>
            <div className="mt-6">
              <Link to="/products" className="text-sm font-medium text-primary hover:underline">
                Continue shopping →
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
