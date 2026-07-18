import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminShell
      title="Analytics"
      subtitle="Revenue, traffic, conversion & cohort insights"
    >
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-[15px] font-semibold">Coming soon</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
          Detailed sales reports, top products, customer LTV and traffic sources
          will live here.
        </p>
      </div>
    </AdminShell>
  ),
});
