import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/account/orders")({
  head: () => ({ meta: [{ title: "My orders — Shopdesk" }] }),
  component: MyOrders,
});

function MyOrders() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders_cache")
        .select("wc_order_id, order_number, status, total, currency, date_created, items_count")
        .order("date_created", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-3xl font-semibold">My orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders matched to your account email.
        </p>

        <div className="mt-6 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data?.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No orders yet.
            </Card>
          )}
          {data?.map((o) => (
            <Card key={o.wc_order_id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Order #{o.order_number}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.date_created).toLocaleDateString()} · {o.items_count} items
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{o.status}</Badge>
                <span className="font-mono text-sm">
                  {o.currency} {Number(o.total).toFixed(2)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
