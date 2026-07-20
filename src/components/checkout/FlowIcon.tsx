import type { LucideIcon } from "lucide-react";

/**
 * Unified simple animated brand icon used across the order verification flow.
 * No frames, fills, glows, or background shapes — only the icon itself.
 */
type Props =
  | { variant: "static"; icon: LucideIcon }
  | { variant: "check" }
  | { variant: "warn" };

export function FlowIcon(props: Props) {
  return (
    <div className="relative mx-auto mb-6 grid h-24 w-24 place-items-center text-primary animate-in zoom-in-95 fade-in duration-500">
      {props.variant === "static" && (
        <props.icon className="h-16 w-16 animate-[flowIconFloat_2.4s_ease-in-out_infinite]" strokeWidth={1.55} aria-hidden />
      )}
      {props.variant === "check" && <CheckAnim />}
      {props.variant === "warn" && <WarnAnim />}
    </div>
  );
}

function CheckAnim() {
  return (
    <svg viewBox="0 0 48 48" className="h-20 w-20" aria-hidden>
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
    <svg viewBox="0 0 48 48" className="h-20 w-20" aria-hidden>
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
