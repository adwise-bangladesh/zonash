import { memo, type ComponentType, type RefObject } from "react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Hero card used on the customer auth screens. Mirrors the /support hero
 * language (primary card, 2xl radius, soft ring) with a 2-step indicator.
 */
export const AuthHero = memo(function AuthHero({
  icon: Icon,
  title,
  subtitle,
  step,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  step?: 1 | 2;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-primary px-4 py-5 text-primary-foreground shadow-sm ring-1 ring-inset ring-primary-foreground/10">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary-foreground/10"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-12 -left-6 h-24 w-24 rounded-full bg-primary-foreground/[0.07]"
      />
      <div className="relative flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-foreground/15 ring-1 ring-inset ring-primary-foreground/20">
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-primary-foreground/85">{subtitle}</p>
        </div>
      </div>
      {step && (
        <div className="relative mt-4 flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1 flex-1 rounded-full bg-primary-foreground/90" />
          <span
            className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-primary-foreground/90" : "bg-primary-foreground/25"}`}
          />
          <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary-foreground/75">
            Step {step} of 2
          </span>
        </div>
      )}
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
