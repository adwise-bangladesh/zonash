import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type CTA = {
  label: string;
  to?: string;
  onClick?: () => void;
};

/**
 * Empty state card with a soft halo behind the icon and up to two CTAs.
 * Ported from the Nori marketplace visual pattern.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
  children,
  className = "",
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  primary?: CTA;
  secondary?: CTA;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const iconSize = compact ? "h-10 w-10" : "h-16 w-16";
  const titleClass = compact
    ? "text-[14px] font-semibold tracking-tight text-foreground"
    : "text-[16px] font-semibold tracking-tight text-foreground";
  const descClass = compact
    ? "mt-1 max-w-[18rem] text-[11.5px] leading-relaxed text-muted-foreground"
    : "mt-1.5 max-w-[20rem] text-[12.5px] leading-relaxed text-muted-foreground";
  const haloOuter = compact ? "h-24 w-24" : "h-40 w-40";
  const haloInner = compact ? "h-14 w-14" : "h-24 w-24";
  const wrapperPad = compact ? "px-6 py-10" : "px-6 py-16";
  const grow = compact ? "" : "flex-1";

  return (
    <div className={`flex ${grow} w-full flex-col items-center justify-center text-center ${wrapperPad} ${className}`}>
      <div className={`relative mb-6 flex items-center justify-center ${compact ? "mb-4" : ""}`}>
        <div aria-hidden="true" className={`absolute ${haloOuter} -z-10 rounded-full bg-[radial-gradient(circle_at_center,_color-mix(in_oklab,var(--primary)_18%,transparent),_transparent_70%)] blur-2xl`} />
        <div aria-hidden="true" className={`absolute ${haloInner} -z-10 rounded-full bg-[radial-gradient(circle_at_center,_color-mix(in_oklab,var(--primary)_30%,transparent),_transparent_75%)] blur-xl`} />
        <Icon className={`${iconSize} text-primary drop-shadow-[0_6px_18px_color-mix(in_oklab,var(--primary)_35%,transparent)]`} strokeWidth={1.4} aria-hidden="true" />
      </div>

      <h2 className={titleClass}>{title}</h2>
      {description && <p className={descClass}>{description}</p>}

      {(primary || secondary) && (
        <div className="mt-7 flex w-full max-w-[18rem] flex-col items-stretch gap-2">
          {primary && (primary.to ? (
            <Link to={primary.to} className="inline-flex h-11 items-center justify-center rounded-[3px] bg-primary px-6 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition-all hover:bg-primary/90 active:scale-[0.98]">{primary.label}</Link>
          ) : (
            <button type="button" onClick={primary.onClick} className="inline-flex h-11 items-center justify-center rounded-[3px] bg-primary px-6 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition-all hover:bg-primary/90 active:scale-[0.98]">{primary.label}</button>
          ))}
          {secondary && (secondary.to ? (
            <Link to={secondary.to} className="inline-flex h-11 items-center justify-center rounded-[3px] px-6 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground">{secondary.label}</Link>
          ) : (
            <button type="button" onClick={secondary.onClick} className="inline-flex h-11 items-center justify-center rounded-[3px] px-6 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground">{secondary.label}</button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
