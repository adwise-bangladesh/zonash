import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home, Search, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

type Props = {
  code?: string;
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryTo?: string;
};

/**
 * App-native empty / not-found view. Used by the root 404 boundary and by
 * storefront pages that need a "nothing here" screen (missing collection,
 * unavailable category, etc.). Always renders the site header.
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
      <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-start px-5 pt-6 pb-24">
        {/* Hero card */}
        <div className="relative w-full overflow-hidden rounded-[28px] bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent px-6 pt-9 pb-7 text-center ring-1 ring-primary/10">
          {/* Soft blobs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-14 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-primary/[0.06] blur-3xl"
          />

          {/* Illustration */}
          <div className="relative mx-auto mb-5 grid h-28 w-28 place-items-center">
            <div className="absolute inset-0 rounded-full bg-primary/10" />
            <div className="absolute inset-2 rounded-full bg-background shadow-inner ring-1 ring-primary/10" />
            <FloatingBag />
            <Sparkles
              className="absolute -top-1 right-2 h-4 w-4 text-primary/60"
              strokeWidth={2}
            />
            <Sparkles
              className="absolute bottom-1 -left-1 h-3 w-3 text-primary/40"
              strokeWidth={2}
            />
          </div>

          {/* Text */}
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-primary/70">
            Error {code}
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>

          {/* Primary CTA */}
          <Link
            to={primaryTo}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(74,15,15,0.55)] transition active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
            {primaryLabel}
          </Link>
        </div>

        {/* Quick actions */}
        <div className="mt-5 grid w-full grid-cols-2 gap-3">
          <QuickAction
            to="/"
            icon={<Home className="h-4 w-4" strokeWidth={2} />}
            label="Home"
            hint="Start over"
          />
          <QuickAction
            to="/products"
            icon={<Search className="h-4 w-4" strokeWidth={2} />}
            label="Browse shop"
            hint="Discover pieces"
          />
        </div>
      </main>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  label,
  hint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl bg-background/80 px-3.5 py-3 ring-1 ring-border/60 backdrop-blur transition active:scale-[0.98]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[12.5px] font-semibold text-ink">
          {label}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground">
          {hint}
        </span>
      </span>
    </Link>
  );
}

/** Playful "empty shopping bag" mark, drawn inline. */
function FloatingBag() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="relative h-14 w-14 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 22h28l-2.5 26a4 4 0 0 1-4 3.6H24.5a4 4 0 0 1-4-3.6L18 22z" />
      <path d="M25 22v-3a7 7 0 0 1 14 0v3" />
      <path
        d="M27 34c1.4 1.6 3.2 2.4 5 2.4s3.6-.8 5-2.4"
        className="text-primary/60"
      />
    </svg>
  );
}
