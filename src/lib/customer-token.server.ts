/**
 * Signed customer session cookie (server-only).
 *
 * The storefront "login" is a phone + OTP flow, so the only proof that a
 * visitor owns a phone number is the OTP verification that happened on the
 * server. This module turns that proof into an HMAC-signed, httpOnly cookie
 * so subsequent reads (order history, checkout autofill) can trust the phone
 * instead of accepting whatever the client sends in the request body.
 *
 * Format: `<phone>.<expiresAtMs>.<hmacHex>` — no secrets in the payload,
 * tamper-evident, and unreadable/unwritable from JavaScript.
 */
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

const COOKIE = "zonash_cs";
const TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years ("unlimited")
const PHONE_RE = /^01[3-9]\d{8}$/;

/**
 * Fail-closed: the cookie signing key MUST be its own dedicated secret.
 *
 * This used to fall back to `SUPABASE_SERVICE_ROLE_KEY` and then
 * `WC_WEBHOOK_SECRET`, which welded the customer-session trust boundary to a
 * database-admin key and a third-party webhook secret — and an empty final
 * fallback meant a misconfigured deploy would sign cookies with a zero-length
 * key, making sessions forgeable. Now a missing/short secret simply disables
 * sessions (customers re-verify by OTP) and logs loudly once.
 */
const MIN_SECRET_LEN = 16;
let warned = false;
function secret(): string {
  const s = process.env.CUSTOMER_SESSION_SECRET ?? "";
  if (s.length < MIN_SECRET_LEN) {
    if (!warned) {
      warned = true;
      console.error(
        "CUSTOMER_SESSION_SECRET is missing or too short (min 16 chars). " +
          "Customer sessions are disabled until it is configured.",
      );
    }
    return "";
  }
  return s;
}


/**
 * The HMAC key is derived once per isolate. `importKey` is a KDF-ish call that
 * showed up on every single authenticated read (order list page, autofill), so
 * caching it removes one crypto import per request under load.
 */
let keyPromise: Promise<CryptoKey> | null = null;
let keyFor = "";
function hmacKey(): Promise<CryptoKey> {
  const s = secret();
  if (!keyPromise || keyFor !== s) {
    keyFor = s;
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(s),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


/** Constant-time compare of two equal-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Issue the session cookie after a successful OTP verification. */
export async function issueCustomerSession(phone: string): Promise<void> {
  if (!PHONE_RE.test(phone) || !secret()) return;
  const exp = Date.now() + TTL_MS;
  const payload = `${phone}.${exp}`;
  const token = `${payload}.${await sign(payload)}`;
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

/** The verified phone for this request, or null when unauthenticated. */
export async function readCustomerSession(): Promise<string | null> {
  try {
    const raw = getCookie(COOKIE);
    if (!raw || !secret()) return null;
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [phone, expStr, sig] = parts;
    if (!PHONE_RE.test(phone)) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    const expected = await sign(`${phone}.${expStr}`);
    return safeEqual(expected, sig) ? phone : null;
  } catch {
    return null;
  }
}

export function clearCustomerSession(): void {
  try {
    deleteCookie(COOKIE, { path: "/" });
  } catch {
    /* no request context */
  }
}
