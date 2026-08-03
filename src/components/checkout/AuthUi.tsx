import { memo, type ComponentType, type RefObject } from "react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Minimal heading for the customer auth screens: a quiet icon, one title and
 * one supporting line. No decorative hero, no step chrome.
 */
export const AuthHero = memo(function AuthHero({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  /** Accepted for call-site compatibility; no longer rendered. */
  step?: 1 | 2;
}) {
  return (
    <section className="px-1 pt-6 pb-1 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <h2 className="mt-3 font-display text-[19px] font-bold leading-tight tracking-tight">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-[19rem] text-[12.5px] leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </section>
  );
});

/**
 * 4-digit OTP field: one hidden input overlaid on styled slots so mobile
 * keyboards and SMS autofill keep working.
 */
export const OtpBoxes = memo(function OtpBoxes({
  inputRef,
  code,
  busy,
  error,
  onChange,
  length = 4,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  code: string;
  busy?: boolean;
  error?: boolean;
  onChange: (value: string) => void;
  length?: number;
}) {
  const slots = Array.from({ length }, (_, i) => code[i] ?? "");

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        enterKeyHint="done"
        maxLength={length}
        value={code}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        disabled={busy}
        aria-label="One-time verification code"
        aria-invalid={!!error}
        className={`absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 ${focusRing}`}
      />
      <div
        className="flex justify-center gap-2.5"
        aria-hidden="true"
        onClick={() => inputRef.current?.focus()}
      >
        {slots.map((d, i) => {
          const active = code.length === i;
          const filled = !!d;
          return (
            <div
              key={i}
              className={[
                "grid h-14 w-12 place-items-center rounded-2xl border bg-background text-2xl font-bold tabular-nums shadow-sm transition-all duration-150 motion-reduce:transition-none",
                error
                  ? "border-destructive/70 text-destructive"
                  : filled
                    ? "border-primary/70 text-foreground"
                    : active
                      ? "border-primary shadow-[0_0_0_3px_hsl(var(--ring)/0.15)]"
                      : "border-border",
                active && !filled ? "scale-[1.04]" : "",
              ].join(" ")}
            >
              {d ||
                (active && !busy ? (
                  <span className="h-6 w-[2px] animate-pulse rounded-full bg-primary" />
                ) : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
});
