/**
 * BulkSMSBD sender — server-only helper.
 *
 * Docs: https://bulksmsbd.net/api
 * Endpoint: POST https://bulksmsbd.net/api/smsapi
 * Body: { api_key, senderid, number, message }  (number: comma-separated MSISDN, message: UTF-8)
 *
 * Response is JSON on success (response_code === 202 == "SMS Submitted Successfully")
 * or a plain-text/JSON error message otherwise.
 */

const ENDPOINT = "https://bulksmsbd.net/api/smsapi";

export class SmsError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`BulkSMSBD ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

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

export async function sendSms(params: {
  phone: string;
  message: string;
  timeoutMs?: number;
}): Promise<SmsSendResult> {
  const apiKey = process.env.BULKSMSBD_API_KEY;
  const senderId = process.env.BULKSMSBD_SENDER_ID;
  if (!apiKey || !senderId) {
    return { ok: false, status: 0, message: "BulkSMSBD is not configured" };
  }

  const number = normalizeBdPhone(params.phone);
  if (!number) {
    return { ok: false, status: 0, message: "Invalid Bangladesh phone number" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        senderid: senderId,
        number,
        message: params.message,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "Network error contacting SMS gateway",
    };
  }
  clearTimeout(timer);

  const text = await res.text();
  let responseCode: number | undefined;
  let providerMessage: string | undefined;
  try {
    const j = JSON.parse(text) as { response_code?: number; success_message?: string; error_message?: string };
    responseCode = typeof j.response_code === "number" ? j.response_code : undefined;
    providerMessage = j.success_message || j.error_message;
  } catch {
    // BulkSMSBD occasionally returns plain text on errors.
  }

  const ok = res.ok && (responseCode === undefined || responseCode === 202);
  if (!ok) {
    console.error(`BulkSMSBD send failed [${res.status}] code=${responseCode}: ${text.slice(0, 500)}`);
  }
  return {
    ok,
    status: res.status,
    responseCode,
    message: providerMessage || (ok ? "SMS submitted" : `HTTP ${res.status}`),
    raw: text.slice(0, 1000),
  };
}
