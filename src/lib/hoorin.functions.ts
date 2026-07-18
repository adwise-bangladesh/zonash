/**
 * Server functions for Hoorin customer verification.
 *
 * Staff-only. Wraps the OG-Connect fraud/history API so the admin UI can
 * check a customer's phone number without exposing the API key or bypassing
 * authentication.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getHoorinStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { hoorinConfigured, hoorinSearch } = await import("./hoorin.server");
    const configured = hoorinConfigured();
    if (!configured) {
      return { configured: false as const, ok: false, error: null as string | null };
    }
    try {
      // Probe with a known dummy number; a 4xx from the API is still a valid
      // signal that credentials are accepted.
      await hoorinSearch("01642444088", { cache: "on", timeoutMs: 10_000 });
      return { configured: true as const, ok: true, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Hoorin API error";
      // 400 = bad phone (still means the key works); anything else = auth/network
      const looksAuth = /401|403|invalid api key|apiKey/i.test(msg);
      return { configured: true as const, ok: !looksAuth, error: looksAuth ? msg : null };
    }
  });

export const verifyCustomerPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        phone: z.string().min(6).max(20),
        fresh: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { hoorinSearch } = await import("./hoorin.server");
    return hoorinSearch(data.phone, { cache: data.fresh ? "off" : "on" });
  });
