/**
 * Block / unblock identities (phone, email, IP, fingerprint) used to
 * screen incoming orders. Staff-only via RLS (is_staff_or_admin).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BlockKind = "phone" | "email" | "ip" | "fingerprint";

export type BlockedIdentity = {
  id: string;
  kind: BlockKind;
  value: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

const kindSchema = z.enum(["phone", "email", "ip", "fingerprint"]);

function normalize(kind: BlockKind, value: string): string {
  const v = value.trim();
  if (kind === "phone") return v.replace(/\D+/g, "");
  if (kind === "email") return v.toLowerCase();
  return v;
}

const lookupSchema = z.object({
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  ip: z.string().max(64).optional(),
  fingerprint: z.string().max(120).optional(),
});

/** Return blocks matching any of the supplied identities. */
export const lookupBlocksForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => lookupSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient };
    const wants: { kind: BlockKind; value: string }[] = [];
    if (data.phone) wants.push({ kind: "phone", value: normalize("phone", data.phone) });
    if (data.email) wants.push({ kind: "email", value: normalize("email", data.email) });
    if (data.ip) wants.push({ kind: "ip", value: normalize("ip", data.ip) });
    if (data.fingerprint)
      wants.push({ kind: "fingerprint", value: normalize("fingerprint", data.fingerprint) });

    if (wants.length === 0) return { rows: [] as BlockedIdentity[] };

    const values = wants.map((w) => w.value.toLowerCase());
    const { data: rows, error } = await ctx.supabase
      .from("blocked_identities")
      .select("*")
      .in("kind", Array.from(new Set(wants.map((w) => w.kind))))
      .in("value", values);
    if (error) throw error;

    // Client-side filter to match kind+value pairs exactly (case-insensitive).
    const set = new Set(wants.map((w) => `${w.kind}:${w.value.toLowerCase()}`));
    const filtered = ((rows ?? []) as BlockedIdentity[]).filter((r) =>
      set.has(`${r.kind}:${r.value.toLowerCase()}`),
    );
    return { rows: filtered };
  });

const addSchema = z.object({
  kind: kindSchema,
  value: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
});

export const addBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => addSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient; userId: string };
    const value = normalize(data.kind, data.value);
    if (!value) throw new Error("Empty value");
    const { data: row, error } = await ctx.supabase
      .from("blocked_identities")
      .upsert(
        {
          kind: data.kind,
          value,
          reason: data.reason ?? null,
          created_by: ctx.userId,
        },
        { onConflict: "kind,value" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return { row: row as BlockedIdentity };
  });

const removeSchema = z.object({ id: z.string().uuid() });

export const removeBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => removeSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient };
    const { error } = await ctx.supabase
      .from("blocked_identities")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
