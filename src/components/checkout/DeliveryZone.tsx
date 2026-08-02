import { formatBDT } from "@/lib/format";

/**
 * Delivery zone picker.
 *
 * Shoppers pick one of two delivery zones and
 * the zone alone decides the delivery charge (80 BDT inside Dhaka, 130 BDT
 * outside). The exact locality still arrives in the free-text address field, so
 * nothing is lost for the courier.
 */
export type DeliveryZone = "inside" | "outside";

export const ZONE_LABEL: Record<DeliveryZone, string> = {
  inside: "Inside Dhaka",
  outside: "Outside Dhaka",
};

export const ZONE_FEE: Record<DeliveryZone, number> = {
  inside: 80,
  outside: 130,
};

/** Safer default: the higher rate, so we never under-charge before detection. */
export const DEFAULT_ZONE: DeliveryZone = "outside";

/**
 * Dhaka-city localities. Used to auto-switch the zone once the shopper types an
 * address we recognise. Deliberately conservative — anything unmatched stays on
 * the outside-Dhaka rate.
 */
const DHAKA_HINTS = [
  "dhaka", "ঢাকা", "gulshan", "banani", "baridhara", "bashundhara", "badda", "rampura",
  "mohakhali", "tejgaon", "banasree", "khilgaon", "malibagh", "moghbazar", "shantinagar",
  "paltan", "motijheel", "kamalapur", "sabujbagh", "mugdha", "jatrabari", "demra",
  "wari", "sutrapur", "lalbagh", "kotwali", "chawkbazar", "hazaribagh", "dhanmondi",
  "mohammadpur", "adabor", "shyamoli", "kalabagan", "new market", "azimpur",
  "sher-e-bangla", "agargaon", "mirpur", "pallabi", "kafrul", "cantonment", "kazipara",
  "shewrapara", "uttara", "airport", "khilkhet", "turag", "dakshinkhan", "uttarkhan",
  "bhatara", "gulshan-2", "niketan", "farmgate", "kalyanpur", "gabtoli", "savar-free",
];

/** Localities that contain a Dhaka hint but are outside Dhaka City. */
const NOT_DHAKA_CITY = ["savar", "keraniganj", "dohar", "nawabganj", "dhamrai", "narayanganj", "gazipur"];

/** Best-effort zone from a free-text address. `null` = unknown, leave as-is. */
export function zoneFromAddress(address: string): DeliveryZone | null {
  const t = (address || "").toLowerCase();
  if (t.trim().length < 4) return null;
  if (NOT_DHAKA_CITY.some((k) => t.includes(k))) return "outside";
  if (DHAKA_HINTS.some((k) => t.includes(k))) return "inside";
  return null;
}

/** Dhaka City bounding box (approx). `null` when the fix is outside/unusable. */
export function zoneFromCoords(lat?: number, lng?: number): DeliveryZone | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const inside = lat >= 23.66 && lat <= 23.92 && lng >= 90.31 && lng <= 90.50;
  return inside ? "inside" : null;
}

/** Reads the GPS fix <GpsGate/> cached for this session, if any. */
export function cachedGpsZone(): DeliveryZone | null {
  try {
    const raw = sessionStorage.getItem("zonash:gps");
    if (!raw) return null;
    const fix = JSON.parse(raw) as { lat?: number; lng?: number };
    return zoneFromCoords(fix.lat, fix.lng);
  } catch {
    return null;
  }
}

export function DeliveryZonePicker({
  value,
  onChange,
  invalid,
}: {
  value: DeliveryZone | "";
  onChange: (zone: DeliveryZone) => void;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Delivery area"
      className={`grid grid-cols-2 gap-1.5 rounded-[3px] ${invalid ? "ring-1 ring-destructive" : ""}`}
    >
      {(["inside", "outside"] as const).map((zone) => {
        const active = value === zone;
        return (
          <button
            key={zone}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(zone)}
            className={`flex h-11 min-w-0 flex-col items-start justify-center gap-0 rounded-[3px] border px-2.5 text-left transition-colors ${
              active
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:border-primary/40"
            }`}
          >
            <span
              className={`w-full truncate text-[12.5px] font-semibold leading-tight ${
                active ? "text-primary" : "text-foreground"
              }`}
            >
              {ZONE_LABEL[zone]}
            </span>
            <span
              className={`w-full truncate text-[11px] leading-tight tabular-nums ${
                active ? "text-primary/80" : "text-muted-foreground"
              }`}
            >
              {formatBDT(ZONE_FEE[zone])} delivery
            </span>
          </button>
        );
      })}
    </div>
  );
}
