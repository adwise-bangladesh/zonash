import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listWooOrders, updateOrderStatus, getWooOrder } from "@/lib/woo.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({ meta: [{ title: "Orders — Admin" }] }),
  component: OrdersPage,
});

const STATUSES = ["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"] as const;
type OrderStatus = typeof STATUSES[number];

function OrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const qc = useQueryClient();

  const fetchOrders = useServerFn(listWooOrders);
  const fetchOrder = useServerFn(getWooOrder);
  const changeStatus = useServerFn(updateOrderStatus);

  const { data, isFetching, error } = useQuery({
    queryKey: ["woo-orders", page, search, status],
    queryFn: () =>
      fetchOrders({
        data: {
          page,
          perPage: 25,
          search: search || undefined,
          status: status || undefined,
        },
      }),
  });

  const { data: detail } = useQuery({
    queryKey: ["woo-order", selectedId],
    queryFn: () => fetchOrder({ data: { id: selectedId! } }),
    enabled: selectedId !== null,
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: number; status: OrderStatus }) => changeStatus({ data: v }),
    onSuccess: () => {
      toast.success("Order status updated");
      qc.invalidateQueries({ queryKey: ["woo-orders"] });
      qc.invalidateQueries({ queryKey: ["woo-order"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const rows = data?.orders ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live from WooCommerce
            {data?.error ? ` — ${data.error}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search order #, email, name"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-64"
          />
          <Select
            value={status || "all"}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v === "all" ? "" : v);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">#{r.number}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(r.date_created).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {r.billing?.first_name} {r.billing?.last_name}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.billing?.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.currency} {Number(r.total).toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Select
                      value={r.status}
                      onValueChange={(v) =>
                        statusMut.mutate({ id: r.id, status: v as OrderStatus })
                      }
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setSelectedId(r.id)}>
                      View
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !isFetching && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {error ? "Failed to load orders." : "No orders found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={rows.length < 25}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order #{detail?.number}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Customer</div>
                  <div>{detail.billing.first_name} {detail.billing.last_name}</div>
                  <div>{detail.billing.email}</div>
                  <div>{detail.billing.phone}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Shipping</div>
                  <div>{detail.shipping.address_1}</div>
                  <div>{detail.shipping.city}, {detail.shipping.country}</div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase text-muted-foreground">Items</div>
                <div className="rounded border">
                  {detail.line_items.map((li) => (
                    <div key={li.id} className="flex justify-between border-b p-2 last:border-b-0">
                      <span>{li.name} × {li.quantity}</span>
                      <span className="font-mono">{detail.currency} {Number(li.total).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between border-t pt-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Payment</div>
                  <div>{detail.payment_method_title}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase text-muted-foreground">Total</div>
                  <div className="font-mono text-lg">{detail.currency} {Number(detail.total).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
