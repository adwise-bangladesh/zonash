import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, updateMyProfile } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/admin/profile")({
  head: () => ({
    meta: [{ title: "My profile — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyProfile);
  const updFn = useServerFn(updateMyProfile);

  const profileQ = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => getFn(),
    staleTime: 60_000,
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (profileQ.data) {
      setFullName(profileQ.data.full_name ?? "");
      setEmail(profileQ.data.email ?? "");
    }
  }, [profileQ.data]);

  const saveProfile = useMutation({
    mutationFn: (v: { full_name: string }) => updFn({ data: v }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["me", "profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <AdminShell title="My profile" subtitle="Manage your account details">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Account details</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Your name is used to sign order notes and customer messages.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate({ full_name: fullName });
            }}
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
            </div>
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Change password</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use at least 8 characters. You will stay signed in on this device.
          </p>
          <form className="mt-4 space-y-3" onSubmit={changePassword}>
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={changingPw}>
              {changingPw ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}
