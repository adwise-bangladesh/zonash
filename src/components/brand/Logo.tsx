/**
 * Zonash — modern fine-jewelry wordmark.
 * Editorial Bodoni Moda serif set in wide tracking, matched to the
 * boutique jewelry-house aesthetic (Mejuri / Missoma / Aurate feel).
 */

export function Logo({
  className,
  size = 30,
  tagline = false,
}: {
  className?: string;
  size?: number;
  tagline?: boolean;
}) {
  return (
    <span
      className={`inline-flex flex-col items-center leading-none text-ink ${className ?? ""}`}
      aria-label="Zonash"
    >
      <span
        style={{
          fontFamily: '"Bodoni Moda", "Cormorant Garamond", Georgia, serif',
          fontWeight: 500,
          fontSize: `${size}px`,
          letterSpacing: "0.22em",
          lineHeight: 1,
          textTransform: "uppercase",
          paddingLeft: "0.22em", // optical balance for wide tracking
        }}
      >
        Zonash
      </span>
      {tagline && (
        <span
          className="text-muted-foreground"
          style={{
            marginTop: `${Math.max(4, Math.round(size * 0.22))}px`,
            fontFamily: '"Inter", "Figtree", ui-sans-serif, system-ui, sans-serif',
            fontWeight: 400,
            fontSize: `${Math.max(8, Math.round(size * 0.28))}px`,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Fine&nbsp;Jewelry
        </span>
      )}
    </span>
  );
}
