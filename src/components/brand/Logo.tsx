/**
 * Zonash logo — cart-n glyph paired with wordmark.
 * Playful color animation shared with the hero (see .logo-fun in styles.css).
 */
function CartN({ size = 30 }: { size?: number }) {
  const stroke = 2.4;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="logo-fun"
      aria-hidden="true"
      style={{ display: "inline-block" }}
    >
      <path d="M3 7 H7 L9 11" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 24 V14 Q8 11 11 11 H22 Q25 11 25 14 V24" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 14.5 L22 18 L14 21.5 Z" fill="currentColor" />
      <circle cx="11" cy="27" r="1.8" fill="currentColor" />
      <circle cx="22" cy="27" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  const name = "zonash";
  return (
    <span className={`inline-flex items-end ${className ?? ""}`}>
      <CartN size={30} />
      <span
        className="font-display font-bold tracking-tight text-ink leading-none"
        style={{ fontSize: "26px", marginLeft: "3px" }}
      >
        {name.split("").map((ch, i) => (
          <span
            key={i}
            className="logo-fun"
            style={{
              animationDelay: `${i * 0.15}s, ${i * 0.25}s`,
              display: "inline-block",
            }}
          >
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
