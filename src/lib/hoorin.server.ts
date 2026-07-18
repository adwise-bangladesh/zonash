/**
 * Hoorin OG-Connect — customer verification / fraud lookup (server-only).
 *
 * Given a Bangladeshi mobile number, returns aggregated delivery history
 * across Steadfast / RedX / Pathao / Carrybee.
 *
 * Docs: https://plugin.hoorin.com — GET /courier/api/v1/search
 * Auth: `apiKey` query param (HOORIN_API_KEY).
 */

const BASE_URL = "https://plugin.hoorin.com/courier/api/v1";

export class HoorinError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "HoorinError";
  }
}

export type HoorinCourierBlock = {
  total_parcels?: number;
  delivered_parcels?: number;
  cancelled_parcels?: number;
  details?: string[];
  message?: string;
};

export type HoorinReport = {
  success: boolean;
  overall?: {
    total_parcels: number;
    delivered_parcels: number;
    cancelled_parcels: number;
    success_ratio: number;
  };
  couriers?: {
    steadfast?: HoorinCourierBlock;
    redx?: HoorinCourierBlock;
    pathao?: HoorinCourierBlock;
    carrybee?: HoorinCourierBlock;
  };
  message?: string;
};

export function hoorinConfigured(): boolean {
  return Boolean(process.env.HOORIN_API_KEY);
}

function normalizePhone(raw: string): string {
  const digits = String(raw).replace(/\D+/g, "");
  // Accept 01XXXXXXXXX (11) or 8801XXXXXXXXX (13) → return 11 digits
  if (digits.length === 13 && digits.startsWith("880")) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith("88")) return digits.slice(2);
  return digits.slice(-11);
}

export async function hoorinSearch(
  phone: string,
  opts?: { cache?: "on" | "off"; timeoutMs?: number },
): Promise<HoorinReport> {
  const apiKey = process.env.HOORIN_API_KEY;
  if (!apiKey) throw new HoorinError("HOORIN_API_KEY is not configured.", 412);

  const searchTerm = normalizePhone(phone);
  if (searchTerm.length !== 11) {
    throw new HoorinError("Phone must be an 11-digit Bangladeshi mobile number.", 400);
  }

  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("searchTerm", searchTerm);
  if (opts?.cache === "off") url.searchParams.set("cache", "off");

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
    const text = await res.text();
    let json: HoorinReport | null = null;
    try {
      json = text ? (JSON.parse(text) as HoorinReport) : null;
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      throw new HoorinError(
        (json && json.message) || `Hoorin ${res.status}`,
        res.status,
      );
    }
    return json ?? { success: false, message: "Empty response" };
  } finally {
    clearTimeout(t);
  }
}
