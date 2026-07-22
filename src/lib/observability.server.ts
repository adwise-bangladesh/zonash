/**
 * Server-only observability helper.
 *
 * Writes exceptions to `public.server_error_log` so operators can review
 * failures from the admin dashboard without a third-party APM.
 *
 * Fire-and-forget: logging failures MUST NOT surface to callers or break
 * request flow. Only reachable from *.server.ts / *.functions.ts handlers.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type LogInput = {
  scope: string;
  error: unknown;
  meta?: Record<string, unknown>;
};

function toMessage(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

export function logServerError(input: LogInput): void {
  const { message, stack } = toMessage(input.error);
  // Always mirror to worker logs so failures surface even if DB is down.
  console.error(`[${input.scope}]`, message, input.meta ?? {});
  // Best-effort persistence.
  void (async () => {
    try {
      await supabaseAdmin.from("server_error_log").insert({
        scope: input.scope,
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000) ?? null,
        meta: (input.meta ?? {}) as never,
      });
    } catch {
      // Swallow — never let logging break the request.
    }
  })();
}

/**
 * Wrap a server-function handler so any thrown error is logged before
 * being re-thrown. Usage:
 *
 *   .handler(withErrorLog("orders.submit", async ({ data }) => { ... }))
 */
export function withErrorLog<TArgs extends unknown[], TResult>(
  scope: string,
  handler: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (err) {
      logServerError({ scope, error: err });
      throw err;
    }
  };
}
