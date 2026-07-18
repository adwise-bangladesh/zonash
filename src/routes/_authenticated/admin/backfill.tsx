import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  backfillOrdersPage,
  getCachedOrdersCount,
  getWooOrdersTotal,
} from "@/lib/backfill.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/backfill")({
  component: BackfillPage,
});

function BackfillPage() {
  const qc = useQueryClient();
  const runPage = useServerFn(backfillOrdersPage);

  const wooTotal = useQuery({
    queryKey: ["woo-orders-total"],
    queryFn: () => getWooOrdersTotal(),
  });
  const cached = useQuery({
    queryKey: ["cached-orders-count"],
    queryFn: () => getCachedOrdersCount(),
  });

  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(1);
  const [processed, setProcessed] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);

  const append = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 200));

  const runOne = useMutation({
    mutationFn: async (p: number) => runPage({ data: { page: p, perPage } }),
  });

  async function startBackfill(fromPage: number) {
    setRunning(true);
    stopRef.current = false;
    let p = fromPage;
    let total = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (stopRef.current) {
          append(`Stopped at page ${p}.`);
          break;
        }
        const res = await runOne.mutateAsync(p);
        total += res.processed;
        setPage(p);
        setProcessed((n) => n + res.processed);
        append(`page ${p}: +${res.processed} (last ${res.lastDate ?? "—"})`);
        if (!res.hasMore) {
          append(`Done. Total processed this run: ${total}.`);
          break;
        }
        p += 1;
      }
    } catch (e) {
      append(`ERROR on page ${p}: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["cached-orders-count"] });
      qc.invalidateQueries({ queryKey: ["woo-orders-total"] });
    }
  }

  const wooCount = wooTotal.data?.total ?? 0;
  const cachedCount = cached.data?.count ?? 0;
  const pct = wooCount > 0 ? Math.min(100, Math.round((cachedCount / wooCount) * 100)) : 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Orders Backfill</h1>
        <p className="text-sm text-muted-foreground">
          One-time (or repeat-safe) sync of the entire WooCommerce order history into the
          local cache. Idempotent — reruns update existing rows.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">WooCommerce total</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{wooCount.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cached rows</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{cachedCount.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Coverage</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{pct}%</CardContent>
        </Card>
      </div>

      <Progress value={pct} />

      <Card>
        <CardHeader><CardTitle className="text-base">Run</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <Label htmlFor="page">Start page</Label>
              <Input id="page" type="number" min={1} value={page}
                onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
                disabled={running} />
            </div>
            <div>
              <Label htmlFor="pp">Per page</Label>
              <Input id="pp" type="number" min={1} max={100} value={perPage}
                onChange={(e) => setPerPage(Math.min(100, Math.max(1, Number(e.target.value) || 100)))}
                disabled={running} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => { setProcessed(0); startBackfill(page); }}
              disabled={running}>
              {running ? "Running…" : "Start backfill"}
            </Button>
            <Button variant="outline" disabled={!running} onClick={() => { stopRef.current = true; }}>
              Stop after current page
            </Button>
            <div className="ml-auto text-sm text-muted-foreground self-center">
              Processed this run: <b>{processed}</b> · Current page: <b>{page}</b>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Log</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs font-mono max-h-80 overflow-auto whitespace-pre-wrap">
{log.length === 0 ? "No activity yet." : log.join("\n")}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
