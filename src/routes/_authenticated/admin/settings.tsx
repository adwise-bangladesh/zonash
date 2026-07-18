/**
 * Admin Settings — Nori-style tabbed layout.
 *
 * Sidebar tabs on the left, status strip on top, panels on the right.
 * Preserves Steadfast Courier and Hoorin OG-Connect integrations.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, RefreshCw, Copy, Truck, Loader2, ExternalLink,
  ShieldCheck, Search, Plug, Store as StoreIcon, Bell, KeyRound,
  MessageSquare, Plus, Trash2, Save, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSteadfastStatus } from "@/lib/steadfast.functions";
import { getHoorinStatus, verifyCustomerPhone } from "@/lib/hoorin.functions";
import type { HoorinReport } from "@/lib/hoorin.server";
import {
  listMessageTemplates,
  upsertMessageTemplate,
  deleteMessageTemplate,
  type MessageTemplate,
} from "@/lib/templates.functions";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

type TabKey = "integrations" | "templates" | "general" | "notifications" | "security";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = [
  { key: "integrations",  label: "Integrations",  icon: Plug,          desc: "Couriers and third-party services" },
  { key: "templates",     label: "Templates",     icon: MessageSquare, desc: "Reusable notes and SMS messages" },
  { key: "general",       label: "General",       icon: StoreIcon,     desc: "Business preferences" },
  { key: "notifications", label: "Notifications", icon: Bell,          desc: "Customer alerts and staff pings" },
  { key: "security",      label: "Security",      icon: KeyRound,      desc: "Credentials and access" },
];

function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("integrations");

  const sfFn = useServerFn(getSteadfastStatus);
  const hoFn = useServerFn(getHoorinStatus);

  const sf = useQuery({ queryKey: ["admin", "steadfast-status"], queryFn: () => sfFn(), staleTime: 30_000 });
  const ho = useQuery({ queryKey: ["admin", "hoorin-status"], queryFn: () => hoFn(), staleTime: 60_000 });

  const sfOk = !!sf.data?.configured && !sf.data?.error;
  const hoOk = !!ho.data?.configured && !!ho.data?.ok;

  return (
    <AdminShell title="Settings" subtitle="Couriers, integrations and preferences">
      {/* Status strip */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatusCard label="Steadfast" value={sf.isLoading ? "…" : sfOk ? "Connected" : sf.data?.configured ? "Auth failed" : "Not set"} ok={sfOk} warn={!sfOk} />
        <StatusCard label="Balance" value={typeof sf.data?.balance === "number" ? `${sf.data.balance.toLocaleString()} Tk` : "—"} />
        <StatusCard label="Hoorin" value={ho.isLoading ? "…" : hoOk ? "Connected" : ho.data?.configured ? "Auth failed" : "Not set"} ok={hoOk} warn={!hoOk} />
        <StatusCard label="Domain" value="zonash.com" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        {/* Tabs */}
        <nav className="flex flex-row gap-1 overflow-x-auto rounded-xl border border-input bg-card p-1.5 md:flex-col md:overflow-visible">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition ${
                  active
                    ? "bg-foreground/[0.06] text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Panel */}
        <div className="min-w-0 rounded-xl border border-input bg-card">
          <div className="p-4 sm:p-6">
            <PanelHeader meta={TABS.find((t) => t.key === tab)!} />

            {tab === "integrations" && (
              <div className="space-y-4">
                <SteadfastCard />
                <HoorinCard />
              </div>
            )}

            {tab === "templates" && <TemplatesPanel />}



            {tab === "general" && (
              <EmptyPanel
                title="General preferences"
                desc="Business name, currency and contact details will live here. Storefront branding and SEO are managed on the site config."
              />
            )}

            {tab === "notifications" && (
              <EmptyPanel
                title="Notifications"
                desc="Configure customer email/SMS alerts and staff order pings. Coming soon."
              />
            )}

            {tab === "security" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-input bg-muted/30 p-3 text-[12px] leading-relaxed">
                  <div className="mb-1 font-semibold">Backend secrets</div>
                  <p className="text-muted-foreground">
                    All third-party credentials are stored encrypted on the server.
                    To rotate any key, ask in chat — you'll be prompted through a secure form.
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>• <code>STEADFAST_API_KEY</code> / <code>STEADFAST_SECRET_KEY</code></li>
                    <li>• <code>HOORIN_API_KEY</code></li>
                    <li>• WooCommerce consumer key / secret</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// -----------------------------------------------------------------------------
// Steadfast Courier
// -----------------------------------------------------------------------------

function SteadfastCard() {
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
    <section className="rounded-2xl border border-input bg-background">
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

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Current balance"
            value={q.isLoading ? "…" : configured && typeof balance === "number" ? `${balance.toLocaleString()} Tk` : "—"}
            hint={err ?? undefined}
          />
          <StatCard label="API key" value={configured ? "•••• saved" : "not set"} tone={configured ? "ok" : "warn"} />
          <StatCard label="Secret key" value={configured ? "•••• saved" : "not set"} tone={configured ? "ok" : "warn"} />
        </div>

        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[12px] hover:bg-muted disabled:opacity-60"
        >
          {q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>

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

        <div className="rounded-xl border border-input bg-muted/30 p-3 text-[12px] leading-relaxed">
          <div className="mb-1 font-semibold">Manage API credentials</div>
          <p className="text-muted-foreground">
            Credentials are stored encrypted (<code>STEADFAST_API_KEY</code>,{" "}
            <code>STEADFAST_SECRET_KEY</code>). To rotate, ask in chat:{" "}
            <em>"update Steadfast API keys"</em>.
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
  );
}

// -----------------------------------------------------------------------------
// Hoorin OG-Connect
// -----------------------------------------------------------------------------

function HoorinCard() {
  const statusFn = useServerFn(getHoorinStatus);
  const verifyFn = useServerFn(verifyCustomerPhone);
  const q = useQuery({
    queryKey: ["admin", "hoorin-status"],
    queryFn: () => statusFn(),
    staleTime: 60_000,
  });

  const [phone, setPhone] = useState("");
  const [fresh, setFresh] = useState(false);
  const [report, setReport] = useState<HoorinReport | null>(null);

  const mut = useMutation({
    mutationFn: async () => verifyFn({ data: { phone, fresh } }),
    onSuccess: (r) => {
      setReport(r);
      if (!r?.success) toast.warning(r?.message || "No history found");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lookup failed"),
  });

  const configured = q.data?.configured;
  const ok = q.data?.ok;

  return (
    <section className="rounded-2xl border border-input bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-input px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground/5">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[13px] font-semibold">Customer verification (Hoorin OG-Connect)</div>
            <div className="text-[11px] text-muted-foreground">
              plugin.hoorin.com · Delivery history across Steadfast, RedX, Pathao, Carrybee
            </div>
          </div>
        </div>
        <ConnectionBadge loading={q.isLoading} configured={!!configured} error={!!configured && !ok} />
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="API key" value={configured ? "•••• saved" : "not set"} tone={configured ? "ok" : "warn"} />
          <StatCard label="Domain" value="zonash.com" />
          <StatCard label="Endpoint" value="v1/search" />
        </div>

        <div className="rounded-xl border border-input bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Test lookup
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-[13px]"
            />
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
              Bypass cache
            </label>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !phone.trim() || !configured}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Verify
            </button>
          </div>

          {report && <HoorinReportView report={report} />}
        </div>

        <div className="rounded-xl border border-input bg-muted/30 p-3 text-[12px] leading-relaxed">
          <div className="mb-1 font-semibold">Manage API key</div>
          <p className="text-muted-foreground">
            Stored encrypted as <code>HOORIN_API_KEY</code>. To rotate, ask in chat:{" "}
            <em>"update Hoorin API key"</em>.
          </p>
          <a
            href="https://dash.hoorin.com/settings"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
          >
            Open Hoorin dashboard <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function HoorinReportView({ report }: { report: HoorinReport }) {
  const o = report.overall;
  const c = report.couriers ?? {};
  const ratio = o?.success_ratio ?? 0;
  const tone = ratio >= 90 ? "emerald" : ratio >= 70 ? "amber" : "red";
  const toneBg =
    tone === "emerald" ? "bg-emerald-100 text-emerald-900"
    : tone === "amber" ? "bg-amber-100 text-amber-900"
    : "bg-red-100 text-red-900";

  if (!report.success || !o) {
    return (
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-900">
        {report.message || "No delivery history found for this number."}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${toneBg}`}>
          {ratio.toFixed(2)}% success
        </span>
        <span className="text-[11px] text-muted-foreground">
          {o.delivered_parcels}/{o.total_parcels} delivered · {o.cancelled_parcels} cancelled
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["steadfast", "redx", "pathao", "carrybee"] as const).map((k) => {
          const b = c[k];
          if (!b || typeof b.total_parcels !== "number") {
            return (
              <div key={k} className="rounded-md border border-input bg-background p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{b?.message ?? "—"}</div>
              </div>
            );
          }
          return (
            <div key={k} className="rounded-md border border-input bg-background p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mt-0.5 text-[13px] font-semibold tabular-nums">
                {b.delivered_parcels}/{b.total_parcels}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {(b.cancelled_parcels ?? 0)} cancelled
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shared UI
// -----------------------------------------------------------------------------

function PanelHeader({ meta }: { meta: { label: string; desc: string; icon: React.ComponentType<{ className?: string }> } }) {
  const Icon = meta.icon;
  return (
    <div className="mb-4 flex items-center gap-2.5 border-b border-border pb-3">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-foreground/[0.06] text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">{meta.label}</div>
        <div className="text-[12px] text-muted-foreground">{meta.desc}</div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-input bg-card px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate text-[14px] font-semibold ${warn && !ok ? "text-amber-600" : ok ? "text-emerald-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-dashed border-input bg-muted/20 p-8 text-center">
      <div className="text-[13px] font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">{desc}</p>
    </div>
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

// -----------------------------------------------------------------------------
// Message Templates (private notes + customer SMS)
// -----------------------------------------------------------------------------

type TplKind = "note" | "sms";

function TemplatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMessageTemplates);
  const upsertFn = useServerFn(upsertMessageTemplate);
  const delFn = useServerFn(deleteMessageTemplate);

  const [kind, setKind] = useState<TplKind>("sms");
  const [editing, setEditing] = useState<
    | { id?: string; kind: TplKind; title: string; body: string; sort_order: number }
    | null
  >(null);

  const q = useQuery({
    queryKey: ["admin", "message-templates"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  const list: MessageTemplate[] = (q.data ?? []).filter((t) => t.kind === kind);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("Template saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["admin", "message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-input bg-muted/20 p-3 text-[12px] leading-relaxed">
        <div className="mb-1 font-semibold">How templates are used</div>
        <p className="text-muted-foreground">
          Private notes live only on the WooCommerce order. Customer SMS templates
          are sent via BDBulkSMS to the order's billing phone — the message is also
          logged on the WooCommerce order as a customer-visible note.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-input bg-card p-1">
          {(["sms", "note"] as TplKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-7 rounded-md px-3 text-[12px] font-medium ${
                kind === k
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "sms" ? "Customer SMS" : "Private notes"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({ kind, title: "", body: "", sort_order: (list.length + 1) * 10 })
          }
          className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> New template
        </button>
      </div>

      {editing && (
        <div className="rounded-xl border border-input bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold">
              {editing.id ? "Edit template" : "New template"} ·{" "}
              <span className="text-muted-foreground">
                {editing.kind === "sms" ? "Customer SMS" : "Private note"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="space-y-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">Title</span>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                placeholder="e.g. Order confirmed"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Body {editing.kind === "sms" && <span className="text-muted-foreground/70">· keep under 160 chars for 1 SMS unit (unicode: 70)</span>}
              </span>
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[13px]"
                placeholder={
                  editing.kind === "sms"
                    ? "Zonash: apnar order confirm kora hoyeche. Dhonnobad!"
                    : "Called customer, no answer — retry tomorrow."
                }
              />
              {editing.kind === "sms" && (
                <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">
                  {editing.body.length} chars
                </span>
              )}
            </label>
            <label className="block w-32">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">Sort order</span>
              <input
                type="number"
                value={editing.sort_order}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => save.mutate(editing)}
                disabled={!editing.title.trim() || !editing.body.trim() || save.isPending}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-40"
              >
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save template
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {q.isLoading && (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        )}
        {!q.isLoading && list.length === 0 && (
          <div className="rounded-lg border border-dashed border-input p-6 text-center text-[12px] text-muted-foreground">
            No {kind === "sms" ? "SMS" : "note"} templates yet.
          </div>
        )}
        {list.map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-input bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-[13px] font-semibold">{t.title}</div>
                <span className="rounded-full border border-input px-1.5 py-px text-[10px] text-muted-foreground">
                  #{t.sort_order}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{t.body}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    id: t.id,
                    kind: t.kind,
                    title: t.title,
                    body: t.body,
                    sort_order: t.sort_order,
                  })
                }
                className="rounded-md border border-input p-1.5 hover:bg-muted"
                aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${t.title}"?`)) del.mutate(t.id);
                }}
                className="rounded-md border border-input p-1.5 text-destructive hover:bg-destructive/10"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
