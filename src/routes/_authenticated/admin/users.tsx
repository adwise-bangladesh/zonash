import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listDashboardUsers,
  createDashboardUser,
  updateUserRole,
  removeDashboardUser,
  type ManagedUser,
} from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [{ title: "Users — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

type Role = "admin" | "staff" | "viewer";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  viewer: "Viewer",
};

function UsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDashboardUsers);
  const createFn = useServerFn(createDashboardUser);
  const updateFn = useServerFn(updateUserRole);
  const removeFn = useServerFn(removeDashboardUser);

  const [meId, setMeId] = useState<string>("");
  useState(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? ""));
  });

  const usersQ = useQuery({
    queryKey: ["admin", "dashboard-users"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "staff" as Role,
  });

  const createM = useMutation({
    mutationFn: (data: typeof form) => createFn({ data }),
    onSuccess: () => {
      toast.success("User created");
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", role: "staff" });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updM = useMutation({
    mutationFn: (v: { user_id: string; role: Role }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rmM = useMutation({
    mutationFn: (user_id: string) => removeFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const users = usersQ.data ?? [];

  return (
    <AdminShell
      title="Users"
      subtitle="Manage who can access the dashboard and their roles"
      action={
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Invite user
        </Button>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[minmax(220px,2fr)_140px_160px_160px_100px] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div>User</div>
          <div>Role</div>
          <div>Created</div>
          <div>Last sign-in</div>
          <div className="text-right">Actions</div>
        </div>

        {usersQ.isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No dashboard users yet. Click "Invite user" to add one.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u: ManagedUser) => {
              const currentRole = (u.roles.find((r) =>
                ["admin", "staff", "viewer"].includes(r),
              ) ?? "staff") as Role;
              const isSelf = u.id === meId;
              return (
                <li
                  key={u.id}
                  className="grid grid-cols-[minmax(220px,2fr)_140px_160px_160px_100px] items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {u.full_name || "—"}
                      {isSelf && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          You
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  </div>
                  <div>
                    <Select
                      value={currentRole}
                      onValueChange={(v) =>
                        updM.mutate({ user_id: u.id, role: v as Role })
                      }
                      disabled={isSelf}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.created_at
                      ? new Date(u.created_at).toLocaleDateString()
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleString()
                      : "Never"}
                  </div>
                  <div className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={isSelf}
                      onClick={() => {
                        if (
                          confirm(
                            `Revoke dashboard access for ${u.email}? Their user account is preserved.`,
                          )
                        )
                          rmM.mutate(u.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium text-foreground">Roles</div>
          <ul className="mt-1 space-y-0.5">
            <li>
              <strong>Admin</strong> — full access, can manage users and settings.
            </li>
            <li>
              <strong>Staff</strong> — can manage orders and day-to-day operations.
            </li>
            <li>
              <strong>Viewer</strong> — read-only dashboard access.
            </li>
          </ul>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite dashboard user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-name">Full name</Label>
              <Input
                id="new-name"
                value={form.full_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_name: e.target.value }))
                }
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="new-pass">Temporary password</Label>
              <Input
                id="new-pass"
                type="text"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                minLength={8}
                placeholder="Minimum 8 characters"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Share this password securely. The user can change it from their
                profile after signing in.
              </p>
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createM.mutate(form)}
              disabled={createM.isPending}
            >
              {createM.isPending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

export { ROLE_LABEL };
