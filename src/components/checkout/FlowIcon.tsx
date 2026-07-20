import type { LucideIcon } from "lucide-react";

/**
 * Unified icon frame used across the storefront verification flow
 * (OTP, callback choice, pending, confirmed, review). All five pages
 * share the exact same container so the flow feels like one app.
 *
 * - `variant="static"` renders a plain lucide icon (OTP / callback / pending)
 * - `variant="check"`  renders the animated success checkmark (thank-you page)
 * - `variant="warn"`   renders the animated warning glyph (review page)
 */
type Props =
  | { variant: "static"; icon: LucideIcon }
  | { variant: "check" }
  | { variant: "warn" };

export function FlowIcon(props: Props) {
  return (
    <div className="relative mx-auto mb-6 h-24 w-24">
      {/* soft outer aura */}
      <span
        aria-hidden
        className="absolute -inset-3 rounded-[36px] bg-primary/10 blur-2xl"
      />
      <div className="relative grid h-24 w-24 place-items-center rounded-[28px] bg-gradient-to-br from-primary via-primary to-primary/75 text-primary-foreground shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-primary/20 animate-in zoom-in-50 duration-500">
        {props.variant === "static" && (
          <props.icon className="h-11 w-11" strokeWidth={1.7} aria-hidden />
        )}
        {props.variant === "check" && <CheckAnim />}
        {props.variant === "warn" && <WarnAnim />}
      </div>
    </div>
  );
}

function CheckAnim() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="126"
        strokeDashoffset="126"
        transform="rotate(-90 24 24)"
      >
        <animate attributeName="stroke-dashoffset" from="126" to="0" dur="0.75s" fill="freeze" />
      </circle>
      <path
        d="M14 25 L21 32 L34 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="40"
        strokeDashoffset="40"
      >
        <animate attributeName="stroke-dashoffset" from="40" to="0" dur="0.45s" begin="0.55s" fill="freeze" />
      </path>
    </svg>
  );
}

function WarnAnim() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
      <path
        d="M24 8 L42 39 L6 39 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="110"
        strokeDashoffset="110"
      >
        <animate attributeName="stroke-dashoffset" from="110" to="0" dur="0.7s" fill="freeze" />
      </path>
      <line
        x1="24"
        y1="20"
        x2="24"
        y2="29"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      >
        <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" begin="0.7s" />
      </line>
      <circle cx="24" cy="34" r="2.2" fill="currentColor">
        <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" begin="0.7s" />
      </circle>
    </svg>
  );
}
