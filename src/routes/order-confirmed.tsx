import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

const searchSchema = z.object({
  id: z.number().optional(),
  number: z.string().optional(),
});

export const Route = createFileRoute("/order-confirmed")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Order confirmed — Zonash" }, { name: "robots", content: "noindex" }] }),
  component: Confirmed,
});

function Confirmed() {
  const { number } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-24 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
        <h1 className="mt-6 font-display text-4xl">Thank you</h1>
        <p className="mt-3 text-muted-foreground">
          Your order {number ? <span className="font-medium text-foreground">#{number}</span> : ""} has been received.
          A confirmation email is on its way.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/products"><Button variant="outline" className="rounded-none">Continue shopping</Button></Link>
          <Link to="/account/orders"><Button className="rounded-none">View my orders</Button></Link>
        </div>
      </main>
    </div>
  );
}
