import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Shopdesk" }] }),
  component: Analytics,
});

function Analytics() {
  const { data } = useQuery({
    queryKey: ["analytics-30d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("orders_cache")
        .select("date_created, total, status")
        .gte("date_created", since.toISOString())
        .order("date_created", { ascending: true });
      if (error) throw error;

      const buckets: Record<string, { date: string; revenue: number; orders: number }> = {};
      for (const o of data ?? []) {
        const d = new Date(o.date_created).toISOString().slice(0, 10);
        buckets[d] ??= { date: d, revenue: 0, orders: 0 };
        buckets[d].revenue += Number(o.total ?? 0);
        buckets[d].orders += 1;
      }
      return Object.values(buckets);
    },
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last 30 days.</p>
      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">Revenue</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
              <YAxis stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">Orders per day</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
              <YAxis stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
