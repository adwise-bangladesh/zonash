import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Home,
  Search,
  Sparkles,
  RotateCcw,
  AlertTriangle,
  PackageX,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

export type NotFoundVariant = "not-found" | "error" | "empty";

type Props = {
  variant?: NotFoundVariant;
  code?: string;
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryTo?: string;
  /** When provided, primary CTA becomes a button and triggers this retry. */
  onRetry?: () => void;
  /** Override the illustration mark. Defaults per variant. */
  icon?: LucideIcon;
  /** When true, skip the AppHeader + full-screen shell (host page renders its own). */
  bare?: boolean;
};

/**
 * App-native empty / not-found / error view. Used by the root 404 boundary
 * and by storefront pages that need a "nothing here" or "something broke"
 * screen. Renders the site header unless `bare` is set.
 */
export function NotFoundView({
  variant = "not-found",
  code,
  title,
  description,
  primaryLabel,
  primaryTo = "/",
  onRetry,
  icon,
  bare = false,
}: Props) {
  const defaults = VARIANT_DEFAULTS[variant];
  const resolvedCode = code ?? defaults.code;
  const resolvedTitle = title ?? defaults.title;
  const resolvedDescription = description ?? defaults.description;
  const resolvedPrimaryLabel =
    primaryLabel ?? (onRetry ? "Try again" : defaults.primaryLabel);
  const HeroIcon = icon ?? defaults.icon;

  const body = (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[480px] flex-col items-center justify-start px-5 pt-6 pb-24">
        {/* Hero card */}
        <div className="relative w-full overflow-hidden rounded-[28px] bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent px-6 pt-9 pb-7 text-center ring-1 ring-primary/10">
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
            <HeroIcon
              className="relative h-12 w-12 text-primary"
              strokeWidth={1.75}
            />
            <Sparkles
              className="absolute -top-1 right-2 h-4 w-4 text-primary/60"
              strokeWidth={2}
            />
            <Sparkles
              className="absolute bottom-1 -left-1 h-3 w-3 text-primary/40"
              strokeWidth={2}
            />
          </div>

          <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-primary/70">
            {resolvedCode}
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">
            {resolvedTitle}
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
            {resolvedDescription}
          </p>

          {/* Primary CTA */}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(74,15,15,0.55)] transition active:scale-[0.98]"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
              {resolvedPrimaryLabel}
            </button>
          ) : (
            <Link
              to={primaryTo}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(74,15,15,0.55)] transition active:scale-[0.98]"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
              {resolvedPrimaryLabel}
            </Link>
          )}
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

const VARIANT_DEFAULTS: Record<
  NotFoundVariant,
  {
    code: string;
    title: string;
    description: string;
    primaryLabel: string;
    icon: LucideIcon;
  }
> = {
  "not-found": {
    code: "Error 404",
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    primaryLabel: "Back to home",
    icon: PackageX,
  },
  error: {
    code: "Something broke",
    title: "This page didn't load",
    description:
      "We hit a snag loading this page. You can try again or head back home.",
    primaryLabel: "Try again",
    icon: AlertTriangle,
  },
  empty: {
    code: "Nothing here yet",
    title: "This collection is empty",
    description: "We're stocking the shelves. Browse everything else in the shop.",
    primaryLabel: "Browse all",
    icon: LayoutGrid,
  },
};

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
