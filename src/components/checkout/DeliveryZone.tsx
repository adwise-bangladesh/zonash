import { Check } from "lucide-react";

/**
 * Delivery zone picker.
 *
 * Replaces the old thana / upazila combobox: shoppers pick one of two zones and
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
    <div role="radiogroup" aria-label="Delivery area" className="grid grid-cols-2 gap-2">
      {(["inside", "outside"] as const).map((zone) => {
        const active = value === zone;
        return (
          <button
            key={zone}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(zone)}
            className={`flex h-11 items-center justify-between gap-2 rounded-[3px] border px-3 text-left text-sm font-medium transition-colors ${
              active
                ? "border-primary bg-primary/5 text-primary"
                : invalid
                  ? "border-destructive text-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/40"
            }`}
          >
            <span>{ZONE_LABEL[zone]}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              ৳{ZONE_FEE[zone]}
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
