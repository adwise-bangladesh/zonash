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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && /^01[3-9]\d{8}$/.test(raw)) setPhoneState(raw);
    } catch {
      /* ignore */
    }
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
