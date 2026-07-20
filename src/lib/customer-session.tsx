import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Lightweight storefront "logged in" state. Customers authenticate with
 * their mobile number + a 4-digit SMS OTP; the verified phone is kept
 * in localStorage so they can view their orders and enjoy checkout autofill.
 *
 * This is intentionally NOT a Supabase user session — dashboard staff are
 * the only real Supabase users.
 */
type Ctx = {
  phone: string | null;
  ready: boolean;
  setPhone: (p: string | null) => void;
  logout: () => void;
};

const STORAGE_KEY = "zonash:customer-phone";
const COOKIE_KEY = "zonash_customer_phone";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years ("unlimited")
const PHONE_RE = /^01[3-9]\d{8}$/;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  if (value === null) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  } else {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }
}

const CustomerSessionContext = createContext<Ctx>({
  phone: null,
  ready: false,
  setPhone: () => {},
  logout: () => {},
});

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const [phone, setPhoneState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let found: string | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && PHONE_RE.test(raw)) found = raw;
    } catch {
      /* ignore */
    }
    if (!found) {
      const c = readCookie(COOKIE_KEY);
      if (c && PHONE_RE.test(c)) {
        found = c;
        try { localStorage.setItem(STORAGE_KEY, c); } catch { /* ignore */ }
      }
    } else {
      // Backfill cookie from localStorage so the session survives storage clears.
      writeCookie(COOKIE_KEY, found);
    }
    if (found) setPhoneState(found);
    setReady(true);
  }, []);

  const setPhone = useCallback((p: string | null) => {
    setPhoneState(p);
    try {
      if (p) localStorage.setItem(STORAGE_KEY, p);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    writeCookie(COOKIE_KEY, p);
  }, []);

  const logout = useCallback(() => setPhone(null), [setPhone]);

  return (
    <CustomerSessionContext.Provider value={{ phone, ready, setPhone, logout }}>
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession() {
  return useContext(CustomerSessionContext);
}
