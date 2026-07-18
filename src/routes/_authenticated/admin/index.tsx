import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardStats } from "@/lib/orders.functions";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Shopdesk" }] }),
  component: Overview,
});

function Overview() {
  const fetchStats = useServerFn(getDashboardStats);
  const { data, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
  });

  // Realtime: refresh on new orders
  useEffect(() => {
    const channel = supabase
      .channel("orders-cache-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders_cache" },
        (payload) => {
          const row = payload.new as { order_number: string };
          toast.success(`New order #${row.order_number}`);
          refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const cards = [
    { label: "Revenue today", value: data ? `$${data.todayRevenue.toFixed(2)}` : "—" },
    { label: "Orders today", value: data?.todayOrders ?? "—" },
    { label: "AOV today", value: data ? `$${data.todayAov.toFixed(2)}` : "—" },
    { label: "Pending", value: data?.pendingCount ?? "—" },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live snapshot of today's activity.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">{c.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
