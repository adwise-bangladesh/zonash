/**
 * Admin Settings — courier integrations.
 *
 * Currently supports Steadfast Courier Ltd (Bangladesh). API keys are stored
 * as server-side secrets (STEADFAST_API_KEY / STEADFAST_SECRET_KEY). The page
 * shows the connection state, current balance, and the webhook URL to paste
 * into the Steadfast dashboard.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, RefreshCw, Copy, Truck, Loader2, ExternalLink, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSteadfastStatus } from "@/lib/steadfast.functions";
import { getHoorinStatus, verifyCustomerPhone } from "@/lib/hoorin.functions";
import type { HoorinReport } from "@/lib/hoorin.server";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const statusFn = useServerFn(getSteadfastStatus);
  const q = useQuery({
    queryKey: ["admin", "steadfast-status"],
    queryFn: () => statusFn(),
    staleTime: 30_000,
  });

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/public/webhooks/steadfast`;
  }, []);

  const copy = async (v: string, label: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const configured = q.data?.configured;
  const balance = q.data?.balance;
  const err = q.data?.error;

  return (
    <AdminShell title="Settings" subtitle="Couriers, integrations and preferences">
      <div className="max-w-3xl space-y-4">
        <section className="rounded-2xl border border-input bg-card">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-input px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground/5">
                <Truck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold">Steadfast Courier</div>
                <div className="text-[11px] text-muted-foreground">
                  portal.packzy.com · Bangladesh delivery partner
                </div>
              </div>
            </div>
            <ConnectionBadge loading={q.isLoading} configured={!!configured} error={!!err} />
          </div>

          {/* Body */}
          <div className="space-y-4 p-4">
            {/* Balance */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Current balance"
                value={
                  q.isLoading
                    ? "…"
                    : configured && typeof balance === "number"
                      ? `৳ ${balance.toLocaleString()}`
                      : "—"
                }
                hint={err ?? undefined}
              />
              <StatCard
                label="API key"
                value={configured ? "•••• saved" : "not set"}
                tone={configured ? "ok" : "warn"}
              />
              <StatCard
                label="Secret key"
                value={configured ? "•••• saved" : "not set"}
                tone={configured ? "ok" : "warn"}
              />
            </div>

            <button
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[12px] hover:bg-muted disabled:opacity-60"
            >
              {q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>

            {/* Webhook */}
            <div className="rounded-xl border border-input bg-muted/30 p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Webhook URL
              </div>
              <p className="mb-2 text-[12px] text-muted-foreground">
                Paste this URL into your Steadfast dashboard webhook settings. Delivery
                status and tracking updates will sync automatically.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
                <code className="flex-1 truncate text-[12px]">{webhookUrl || "—"}</code>
                <button
                  onClick={() => webhookUrl && copy(webhookUrl, "Webhook URL")}
                  className="inline-flex h-6 items-center gap-1 rounded border border-input px-1.5 text-[11px] hover:bg-muted"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Authorization header: <code className="rounded bg-background px-1">Bearer &lt;your API key&gt;</code>
              </div>
            </div>

            {/* Key management notice */}
            <div className="rounded-xl border border-input bg-muted/30 p-3 text-[12px] leading-relaxed">
              <div className="mb-1 font-semibold">Manage API credentials</div>
              <p className="text-muted-foreground">
                Steadfast credentials are stored encrypted as backend secrets
                (<code>STEADFAST_API_KEY</code>, <code>STEADFAST_SECRET_KEY</code>).
                To rotate them, ask in chat: <em>"update Steadfast API keys"</em> —
                you'll be prompted through a secure form.
              </p>
              <a
                href="https://portal.packzy.com/"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
              >
                Open Steadfast dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {err && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
                {err}
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function ConnectionBadge({
  loading, configured, error,
}: { loading: boolean; configured: boolean; error: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking
      </span>
    );
  }
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900">
        <XCircle className="h-3 w-3" /> Not configured
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-1 text-[11px] font-medium text-red-900">
        <XCircle className="h-3 w-3" /> Auth failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-900">
      <CheckCircle2 className="h-3 w-3" /> Connected
    </span>
  );
}

function StatCard({
  label, value, hint, tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-xl border border-input bg-background p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-[16px] font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
