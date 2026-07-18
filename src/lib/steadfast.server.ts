/**
 * Steadfast Courier Ltd — REST client (server-only).
 *
 * Base URL: https://portal.packzy.com/api/v1
 * Auth: `Api-Key` + `Secret-Key` headers (from env secrets).
 */

const BASE_URL = "https://portal.packzy.com/api/v1";

export class SteadfastError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "SteadfastError";
  }
}

function headers(): Record<string, string> {
  const apiKey = process.env.STEADFAST_API_KEY;
  const secretKey = process.env.STEADFAST_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new SteadfastError(
      "Steadfast API keys are not configured. Add STEADFAST_API_KEY and STEADFAST_SECRET_KEY.",
      412,
    );
  }
  return {
    "Api-Key": apiKey,
    "Secret-Key": secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), init?.timeoutMs ?? 15_000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(),
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ac.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      // Log full context server-side for debugging (never reaches the browser).
      console.error(`[steadfast] ${init?.method ?? "GET"} ${path} → ${res.status}`, {
        body: init?.body,
        response: text.slice(0, 1000),
      });
      const j = json as { message?: unknown; errors?: Record<string, string[] | string> } | null;
      const baseMsg =
        j && typeof j.message === "string" && j.message.trim()
          ? j.message
          : `Steadfast ${res.status}`;
      // Include validation-style errors when present (e.g. { errors: { invoice: ["already exists"] } })
      let detail = "";
      if (j?.errors && typeof j.errors === "object") {
        detail = Object.entries(j.errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .join("; ");
      } else if (!json && text) {
        detail = text.slice(0, 200);
      }
      throw new SteadfastError(detail ? `${baseMsg} — ${detail}` : baseMsg, res.status, json ?? text);
    }
    return json as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Types ----------

export type CreateConsignmentInput = {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  alternative_phone?: string;
  recipient_email?: string;
  recipient_address: string;
  cod_amount: number;
  note?: string;
  item_description?: string;
  total_lot?: number;
  delivery_type?: 0 | 1;
};

export type Consignment = {
  consignment_id: number;
  invoice: string;
  tracking_code: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  status: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BalanceResponse = { status: number; current_balance: number };
export type CreateOrderResponse = { status: number; message: string; consignment: Consignment };
export type DeliveryStatusResponse = { status: number; delivery_status: string };

// ---------- API surface ----------

export function sfGetBalance(): Promise<BalanceResponse> {
  return request<BalanceResponse>("/get_balance");
}

export function sfCreateOrder(input: CreateConsignmentInput): Promise<CreateOrderResponse> {
  return request<CreateOrderResponse>("/create_order", {
    method: "POST",
    body: input,
  });
}

export type BulkConsignmentItem = {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  note?: string;
};

export type BulkConsignmentResult = {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: string | number;
  note?: string | null;
  consignment_id: number | null;
  tracking_code: string | null;
  status: "success" | "error" | string;
};

export type BulkCreateResponse =
  | BulkConsignmentResult[]
  | { data: BulkConsignmentResult[]; status?: number; message?: string };

/**
 * POST /create_order/bulk-order
 * Body: { data: "<json-encoded array of items>" }  (max 500)
 */
export async function sfCreateBulk(items: BulkConsignmentItem[]): Promise<BulkConsignmentResult[]> {
  if (items.length === 0) return [];
  const res = await request<BulkCreateResponse>("/create_order/bulk-order", {
    method: "POST",
    body: { data: JSON.stringify(items) },
    timeoutMs: 60_000,
  });
  return Array.isArray(res) ? res : (res.data ?? []);
}

export function sfStatusByCid(id: number): Promise<DeliveryStatusResponse> {
  return request<DeliveryStatusResponse>(`/status_by_cid/${id}`);
}

export function sfStatusByInvoice(invoice: string): Promise<DeliveryStatusResponse> {
  return request<DeliveryStatusResponse>(`/status_by_invoice/${encodeURIComponent(invoice)}`);
}

export function sfStatusByTracking(code: string): Promise<DeliveryStatusResponse> {
  return request<DeliveryStatusResponse>(`/status_by_trackingcode/${encodeURIComponent(code)}`);
}

export function steadfastConfigured(): boolean {
  return Boolean(process.env.STEADFAST_API_KEY && process.env.STEADFAST_SECRET_KEY);
}

// ---------- Police stations ----------

export type PoliceStationsResponse = {
  status?: number;
  message?: string;
  data?: unknown;
  police_stations?: unknown;
};

export function sfGetPoliceStations(): Promise<PoliceStationsResponse> {
  return request<PoliceStationsResponse>("/police_stations", { timeoutMs: 20_000 });
}

