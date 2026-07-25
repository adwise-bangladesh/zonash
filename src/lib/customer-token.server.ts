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

function secret(): string {
  return (
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.WC_WEBHOOK_SECRET ||
    ""
  );
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
