import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "admin" | "staff" | "viewer" | "customer";

export type ManagedUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: AppRole[];
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listDashboardUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rolesRows, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const staffIds = Array.from(
      new Set(
        (rolesRows ?? [])
          .filter((r: any) => ["admin", "staff", "viewer"].includes(r.role))
          .map((r: any) => r.user_id as string),
      ),
    );
    if (staffIds.length === 0) return [];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .in("id", staffIds);

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of rolesRows ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id, arr);
    }

    // Fetch auth users for last_sign_in and email fallback
    const authInfo = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
    try {
      const { data: pageData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      for (const u of pageData?.users ?? []) {
        if (staffIds.includes(u.id)) {
          authInfo.set(u.id, {
            email: u.email ?? null,
            last_sign_in_at: (u as any).last_sign_in_at ?? null,
          });
        }
      }
    } catch (e) {
      console.error("listUsers failed", e);
    }

    return staffIds.map((id) => {
      const p = (profiles ?? []).find((x: any) => x.id === id);
      const a = authInfo.get(id);
      return {
        id,
        email: p?.email ?? a?.email ?? null,
        full_name: p?.full_name ?? null,
        created_at: p?.created_at ?? new Date(0).toISOString(),
        last_sign_in_at: a?.last_sign_in_at ?? null,
        roles: (rolesByUser.get(id) ?? []).filter((r) =>
          ["admin", "staff", "viewer"].includes(r),
        ) as AppRole[],
      };
    });
  });

export const createDashboardUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      email: string;
      password: string;
      full_name?: string;
      role: "admin" | "staff" | "viewer";
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const email = data.email.trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) throw new Error("Invalid email");
    if (!data.password || data.password.length < 8)
      throw new Error("Password must be at least 8 characters");
    if (!["admin", "staff", "viewer"].includes(data.role))
      throw new Error("Invalid role");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name?.trim() || null },
    });
    if (error || !created?.user) throw new Error(error?.message || "Failed to create user");

    // Ensure profile row exists (handle_new_user trigger normally creates it)
    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      email,
      full_name: data.full_name?.trim() || null,
    });

    // Remove default 'customer' role and set requested role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { id: created.user.id };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { user_id: string; role: "admin" | "staff" | "viewer" }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!["admin", "staff", "viewer"].includes(data.role))
      throw new Error("Invalid role");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .in("role", ["admin", "staff", "viewer"]);

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeDashboardUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId)
      throw new Error("You cannot remove your own admin access");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .in("role", ["admin", "staff", "viewer"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, created_at, updated_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { full_name?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name?.toString().trim() || null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
