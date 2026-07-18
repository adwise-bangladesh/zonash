/**
 * BDBulkSMS (bdbulksms.net) sender — server-only helper.
 *
 * Endpoint: GET https://api.bdbulksms.net/g_api.php
 * Send params: token, sender, number, sms, json
 * Docs (BN):
 *   https://api.bdbulksms.net/g_api.php?token=X&sender=Y&number=01XXXXXXXXX&sms=hello&json
 *   Balance: https://api.bdbulksms.net/g_api.php?token=X&balance&json
 */

const ENDPOINT = "https://api.bdbulksms.net/g_api.php";

/** Normalise a BD phone number to the local 11-digit form (`01XXXXXXXXX`). */
export function normalizeBdPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("01")) return digits;
  if (digits.length === 13 && digits.startsWith("8801")) return digits.slice(2);
  if (digits.length === 14 && digits.startsWith("88801")) return digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return null;
}

export type SmsSendResult = {
  ok: boolean;
  status: number;
  responseCode?: number;
  message: string;
  raw?: string;
};

function providerCreds(): { token: string; sender: string } | null {
  const token = process.env.BDBULKSMS_TOKEN;
  const sender = process.env.BDBULKSMS_SENDER_ID;
  if (!token || !sender) return null;
  return { token, sender };
}

async function callProvider(
  params: Record<string, string | true>,
  timeoutMs = 15000,
): Promise<{ status: number; text: string; json: unknown | null }> {
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries(params)) {
    if (v === true) url.searchParams.append(k, "");
    else url.searchParams.set(k, v);
  }
  // bdbulksms.net treats bare keys like `&balance` as flags. URL encoding of a
  // bare `?token=X&balance` is preserved by URLSearchParams as `balance=`.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" },
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      // plain text fallback
    }
    return { status: res.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send an SMS via BDBulkSMS. Success is indicated by the provider returning a
 * non-error response. Providers in this family typically return strings like
 * "1901" for success or "1902"/other numeric codes on failure; JSON responses
 * include a `status`/`response_code` field. We accept HTTP 2xx + no explicit
 * error signal as success.
 */
export async function sendSms(params: {
  phone: string;
  message: string;
  timeoutMs?: number;
}): Promise<SmsSendResult> {
  const creds = providerCreds();
  if (!creds) return { ok: false, status: 0, message: "BDBulkSMS is not configured" };

  const number = normalizeBdPhone(params.phone);
  if (!number) {
    return { ok: false, status: 0, message: "Invalid Bangladesh phone number" };
  }

  let r: Awaited<ReturnType<typeof callProvider>>;
  try {
    r = await callProvider(
      {
        token: creds.token,
        sender: creds.sender,
        number,
        sms: params.message,
        json: true,
      },
      params.timeoutMs,
    );
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Network error contacting SMS gateway",
    };
  }

  // Try to interpret provider status codes.
  let responseCode: number | undefined;
  let providerMessage: string | undefined;

  if (r.json && typeof r.json === "object") {
    const j = r.json as Record<string, unknown>;
    const code =
      (typeof j.response_code === "number" && j.response_code) ||
      (typeof j.status === "number" && j.status) ||
      (typeof j.code === "number" && j.code) ||
      undefined;
    if (code !== undefined) responseCode = code;
    const msg =
      (typeof j.message === "string" && j.message) ||
      (typeof j.success_message === "string" && j.success_message) ||
      (typeof j.error_message === "string" && j.error_message) ||
      (typeof j.error === "string" && j.error) ||
      undefined;
    if (msg) providerMessage = msg;
  } else {
    const t = r.text.trim();
    const m = t.match(/^\s*(\d{3,4})\b/);
    if (m) responseCode = Number(m[1]);
    providerMessage = t.slice(0, 200);
  }

  // Success heuristic: HTTP 2xx AND (no code, or a "success"-family code).
  // Known success codes in similar BD gateways: 1901, 202, 200, 1000.
  const isKnownError = responseCode !== undefined && ![1901, 202, 200, 1000].includes(responseCode);
  const looksLikeError = /invalid|error|fail|balance|denied|unauthor/i.test(
    providerMessage || r.text,
  );
  const ok = r.status >= 200 && r.status < 300 && !isKnownError && !looksLikeError;

  if (!ok) {
    console.error(
      `BDBulkSMS send failed [${r.status}] code=${responseCode ?? "-"}: ${r.text.slice(0, 500)}`,
    );
  }

  return {
    ok,
    status: r.status,
    responseCode,
    message: providerMessage || (ok ? "SMS submitted" : `HTTP ${r.status}`),
    raw: r.text.slice(0, 1000),
  };
}

/** Fetch account balance and rate/expiry snapshot. Returns null when not configured. */
export async function getSmsAccount(): Promise<{
  configured: boolean;
  balance?: string | number;
  expiry?: string;
  rate?: string | number;
  raw?: unknown;
  error?: string;
} | null> {
  const creds = providerCreds();
  if (!creds) return { configured: false };
  try {
    const r = await callProvider({
      token: creds.token,
      balance: true,
      expiry: true,
      rate: true,
      json: true,
    });
    if (r.json && typeof r.json === "object") {
      const j = r.json as Record<string, unknown>;
      return {
        configured: true,
        balance: (j.balance as string | number | undefined),
        expiry: (j.expiry as string | undefined),
        rate: (j.rate as string | number | undefined),
        raw: j,
      };
    }
    return { configured: true, raw: r.text };
  } catch (e) {
    return {
      configured: true,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}
