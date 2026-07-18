/**
 * Message templates — reusable snippets for order notes and customer SMS.
 * Stored in `public.message_templates`, staff-only via RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { supabase: SupabaseClient; userId: string };

export type MessageTemplate = {
  id: string;
  kind: "note" | "sms";
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const listMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    const { supabase } = context as unknown as Ctx;
    const { data, error } = await supabase
      .from("message_templates")
      .select("id, kind, title, body, sort_order, created_at, updated_at")
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MessageTemplate[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["note", "sms"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  sort_order: z.number().int().min(0).max(9999).default(100),
});

export const upsertMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => upsertSchema.parse(raw))
  .handler(async ({ data, context }): Promise<MessageTemplate> => {
    const { supabase, userId } = context as unknown as Ctx;
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      kind: data.kind,
      title: data.title,
      body: data.body,
      sort_order: data.sort_order,
      created_by: userId,
    };
    const { data: row, error } = await supabase
      .from("message_templates")
      .upsert(payload as never, { onConflict: "id" })
      .select("id, kind, title, body, sort_order, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as MessageTemplate;
  });

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context as unknown as Ctx;
    const { error } = await supabase.from("message_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
