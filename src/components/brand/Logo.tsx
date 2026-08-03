/**
 * Zonash — luxury jewelry wordmark.
 * A hand-drawn diamond monogram paired with an elegant Cormorant serif wordmark.
 * The mark is a solitaire gem framed inside a Z-shaped fillet, echoing a
 * bezel setting. Text is set in a refined Didone-adjacent serif for a
 * jewelry-house feel; a single hairline underline anchors the mark.
 */

import { useQuery } from "@tanstack/react-query";
import { FALLBACK_SITE_TITLE, siteIdentityQueryOptions } from "@/lib/site-identity";

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
  // Branding comes from WordPress (site title, tagline, custom logo / site icon)
  // and is cached in Postgres + memory server-side, then prefetched in the root
  // loader — so this resolves from the dehydrated cache with no client fetch.
  const { data } = useQuery(siteIdentityQueryOptions());
  const title = data?.title ?? FALLBACK_SITE_TITLE;
  const logo = data?.logo;

  if (logo?.url) {
    const ratio = logo.width && logo.height ? logo.width / logo.height : null;
    const height = Math.round(size * 1.25);
    return (
      <img
        src={logo.url}
        alt={logo.alt ?? title}
        height={height}
        {...(ratio ? { width: Math.round(height * ratio) } : {})}
        decoding="async"
        fetchPriority="high"
        className={`block w-auto object-contain ${className ?? ""}`}
        style={{ height: `${height}px`, maxWidth: "190px" }}
      />
    );
  }

  return <WordmarkLogo className={className} size={size} title={title} tagline={data?.tagline ?? null} />;
}

/** Built-in fallback wordmark, used until/unless WordPress provides a logo. */
function WordmarkLogo({
  className,
  size = 30,
  title = FALLBACK_SITE_TITLE,
  tagline,
}: {
  className?: string;
  size?: number;
  title?: string;
  tagline?: string | null;
}) {
  // A long WP tagline would break the lockup — keep the wordmark's short strap.
  const strap = tagline && tagline.length <= 22 ? tagline : "Fine Jewelry";
  return (
    <span
      className={`group inline-flex items-center gap-[9px] text-primary ${className ?? ""}`}
      aria-label={title}
    >
      <ZonashMark size={size} />
      <span className="flex flex-col leading-none">
        <span
          className="text-ink whitespace-nowrap"
          style={{
            fontFamily: '"Cormorant Garamond", "Instrument Serif", Georgia, serif',
            fontWeight: 500,
            fontSize: `${Math.round(size * 0.86)}px`,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {title}
        </span>
        <span
          className="mt-[3px] text-primary/70 whitespace-nowrap"
          style={{
            fontFamily: '"Figtree", ui-sans-serif, system-ui, sans-serif',
            fontWeight: 500,
            fontSize: `${Math.max(8, Math.round(size * 0.26))}px`,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {strap}
        </span>
      </span>
    </span>
  );
}

