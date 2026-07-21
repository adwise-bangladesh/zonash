import { Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

type Props = {
  code?: string;
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryTo?: string;
};

/**
 * Shared "empty / not found" view used by the root 404 boundary and by
 * storefront pages that need to show a "nothing here" state (missing
 * collection, unavailable category, etc.). Always renders the site header
 * so users can navigate away.
 */
export function NotFoundView({
  code = "404",
  title = "Page not found",
  description = "The page you're looking for doesn't exist or has moved.",
  primaryLabel = "Back to home",
  primaryTo = "/",
}: Props) {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main className="container-page flex flex-col items-center justify-center px-6 py-16 text-center">
        <NotFoundIllustration />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Error {code}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
        <Link
          to={primaryTo}
          className="mt-7 inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition active:scale-[0.98]"
        >
          {primaryLabel}
        </Link>
      </main>
    </div>
  );
}

function NotFoundIllustration() {
  return (
    <svg
      viewBox="0 0 200 160"
      className="h-40 w-40 text-primary/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="100" cy="80" r="56" className="text-primary/10" fill="currentColor" stroke="none" />
      <path d="M62 96 L138 96" className="text-primary/30" />
      <rect x="70" y="52" width="60" height="46" rx="6" />
      <path d="M78 66 h44 M78 78 h30" />
      <circle cx="132" cy="108" r="14" />
      <path d="M142 118 L154 130" />
    </svg>
  );
}
