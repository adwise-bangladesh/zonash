/**
 * Zonash — luxury jewelry wordmark.
 * A hand-drawn diamond monogram paired with an elegant Cormorant serif wordmark.
 * The mark is a solitaire gem framed inside a Z-shaped fillet, echoing a
 * bezel setting. Text is set in a refined Didone-adjacent serif for a
 * jewelry-house feel; a single hairline underline anchors the mark.
 */

function ZonashMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block" }}
    >
      <defs>
        <linearGradient id="zn-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.7" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Outer bezel ring */}
      <circle cx="20" cy="20" r="18.25" stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="0.6" opacity="0.18" />

      {/* Diamond (marquise / brilliant) */}
      <g transform="translate(20 20)">
        <path
          d="M 0 -9 L 7.5 -2.6 L 0 9 L -7.5 -2.6 Z"
          fill="url(#zn-gem)"
        />
        {/* facets */}
        <path d="M 0 -9 L 0 9" stroke="hsl(0 0% 100% / 0.55)" strokeWidth="0.5" />
        <path d="M -7.5 -2.6 L 7.5 -2.6" stroke="hsl(0 0% 100% / 0.35)" strokeWidth="0.5" />
        <path d="M 0 -9 L -3.2 -2.6 L 0 9" stroke="hsl(0 0% 100% / 0.28)" strokeWidth="0.4" fill="none" />
        <path d="M 0 -9 L 3.2 -2.6 L 0 9" stroke="hsl(0 0% 100% / 0.18)" strokeWidth="0.4" fill="none" />
        {/* highlight */}
        <path d="M -2.2 -6 L -0.4 -3.2" stroke="hsl(0 0% 100% / 0.9)" strokeWidth="0.7" strokeLinecap="round" />
      </g>

      {/* Two prong sparkles */}
      <circle cx="6.5" cy="20" r="0.9" fill="currentColor" opacity="0.55" />
      <circle cx="33.5" cy="20" r="0.9" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function Logo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span
      className={`group inline-flex items-center gap-[9px] text-primary ${className ?? ""}`}
      aria-label="Zonash"
    >
      <ZonashMark size={size} />
      <span className="flex flex-col leading-none">
        <span
          className="text-ink"
          style={{
            fontFamily: '"Cormorant Garamond", "Instrument Serif", Georgia, serif',
            fontWeight: 500,
            fontSize: `${Math.round(size * 0.86)}px`,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Zonash
        </span>
        <span
          className="mt-[3px] text-primary/70"
          style={{
            fontFamily: '"Figtree", ui-sans-serif, system-ui, sans-serif',
            fontWeight: 500,
            fontSize: `${Math.max(8, Math.round(size * 0.26))}px`,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Fine&nbsp;Jewelry
        </span>
      </span>
    </span>
  );
}
