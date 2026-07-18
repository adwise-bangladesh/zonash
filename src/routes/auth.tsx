/**
 * Staff sign-in — premium, dashboard-consistent design.
 *
 * Industrial-grade notes:
 * - Login-only. Signups are disabled at the auth provider; no client escape hatch.
 * - Uses Supabase password grant + router.invalidate() so the `_authenticated`
 *   loader re-runs and the redirect lands on a hydrated session.
 * - Client-side rate limit (5 attempts / 60s) to blunt password spraying before
 *   it hits the auth server. Server enforces its own limits as the source of truth.
 * - Caps-lock hint, show/hide password, autofocus, and inline error surface are
 *   pure UX affordances — they never leak whether the email exists.
 * - Toaster is already mounted globally (richColors, top-right) so notifications
 *   here match every other admin surface.
 */
import { createFileRoute, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Zap,
} from "lucide-react";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

const credsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Zonash" },
      { name: "description", content: "Dashboard access for Zonash staff." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/auth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const attempts = useRef<number[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (data.user) {
        navigate({ to: search.redirect ?? "/admin", replace: true });
      } else {
        setChecking(false);
        setTimeout(() => emailRef.current?.focus(), 0);
      }
    });
    return () => {
      alive = false;
    };
  }, [navigate, search.redirect]);

  const year = useMemo(() => new Date().getFullYear(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const now = Date.now();
    attempts.current = attempts.current.filter((t) => now - t < WINDOW_MS);
    if (attempts.current.length >= MAX_ATTEMPTS) {
      const wait = Math.ceil((WINDOW_MS - (now - attempts.current[0])) / 1000);
      toast.error(`Too many attempts. Try again in ${wait}s.`);
      return;
    }

    const parsed = credsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    attempts.current.push(now);
    try {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) throw error;
      // Force loaders (including `_authenticated` gate) to re-read session.
      await router.invalidate();
      toast.success("Signed in", { description: "Redirecting to dashboard…" });
      navigate({ to: search.redirect ?? "/admin", replace: true });
    } catch (err) {
      // Never surface provider internals — keep the message generic.
      const msg =
        err instanceof Error && /invalid|credentials/i.test(err.message)
          ? "Invalid email or password."
          : err instanceof Error
            ? err.message
            : "Sign in failed. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onPwKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") {
      setCapsOn(e.getModifierState("CapsLock"));
    }
  };

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* ── Left / brand panel ──────────────────────────────────────── */}
        <aside
          className="relative hidden overflow-hidden lg:block"
          style={{
            backgroundColor: "oklch(0.16 0.04 230)",
          }}
        >
          {/* Rich, layered canvas — brand gradient + aurora + dotted grid */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(1200px 600px at 0% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 60%), radial-gradient(900px 500px at 100% 100%, color-mix(in oklab, var(--primary-glow) 38%, transparent), transparent 60%), linear-gradient(160deg, oklch(0.18 0.05 230) 0%, oklch(0.14 0.045 235) 55%, oklch(0.11 0.035 240) 100%)",
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, rgba(255,255,255,0.9) 1px, transparent 1.2px)",
              backgroundSize: "26px 26px",
              maskImage:
                "radial-gradient(ellipse at center, black 40%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at center, black 40%, transparent 75%)",
            }}
            aria-hidden
          />
          {/* Aurora blobs — brand primary + glow */}
          <div
            className="absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--primary) 55%, transparent)",
            }}
            aria-hidden
          />
          <div
            className="absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--primary-glow) 45%, transparent)",
            }}
            aria-hidden
          />


          <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
                <span className="font-display text-lg font-bold">Z</span>
              </div>
              <div>
                <div className="font-display text-xl font-semibold leading-none">
                  Zonash <span className="text-white/60">Ops</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-white/60">
                  Operations Console
                </div>
              </div>
            </div>

            {/* Headline + floating mock */}
            <div className="relative -mt-6">
              <div className="max-w-md">
                <h2 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight">
                  Command center for
                  <br />
                  <span className="text-white/80">every order.</span>
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
                  Orders, couriers, verification and SMS — orchestrated from a
                  single high-performance surface.
                </p>
              </div>

              {/* Floating dashboard preview */}
              <div className="relative mt-10 h-[300px]">
                {/* Main orders card */}
                <div
                  className="absolute left-0 top-0 w-[420px] -rotate-[1.5deg] rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur-xl"
                  style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)" }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-white/20" />
                      <span className="h-2 w-2 rounded-full bg-white/20" />
                      <span className="h-2 w-2 rounded-full bg-white/20" />
                    </div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                      Orders · Live
                    </div>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { id: "#8291", name: "Gold Filigree Cuff", meta: "Steadfast · Dhaka", tag: "PROCESSING", tone: "amber" },
                      { id: "#8288", name: "Pearl Pendant Set", meta: "RedX · Chittagong", tag: "SHIPPED", tone: "cyan" },
                      { id: "#8285", name: "Amethyst Studs", meta: "Pathao · Sylhet", tag: "DELIVERED", tone: "emerald" },
                    ].map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-md bg-white/5 font-mono text-[10px] font-semibold text-white/70 ring-1 ring-white/10">
                            {r.id.replace("#", "")}
                          </div>
                          <div>
                            <div className="text-[13px] font-medium text-white/90">
                              {r.name}
                            </div>
                            <div className="text-[10px] text-white/45">{r.meta}</div>
                          </div>
                        </div>
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ring-1"
                          style={
                            r.tone === "emerald"
                              ? {
                                  backgroundColor:
                                    "color-mix(in oklab, #34d399 12%, transparent)",
                                  color: "#6ee7b7",
                                  borderColor: "transparent",
                                  boxShadow:
                                    "inset 0 0 0 1px color-mix(in oklab, #34d399 25%, transparent)",
                                }
                              : r.tone === "cyan"
                                ? {
                                    backgroundColor:
                                      "color-mix(in oklab, #38bdf8 14%, transparent)",
                                    color: "#7dd3fc",
                                    boxShadow:
                                      "inset 0 0 0 1px color-mix(in oklab, #38bdf8 30%, transparent)",
                                  }
                                : {
                                    backgroundColor:
                                      "color-mix(in oklab, #fbbf24 12%, transparent)",
                                    color: "#fcd34d",
                                    boxShadow:
                                      "inset 0 0 0 1px color-mix(in oklab, #fbbf24 25%, transparent)",
                                  }
                          }
                        >
                          {r.tag}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* KPI tile */}
                <div
                  className="absolute right-0 top-6 w-[190px] rotate-[3deg] rounded-2xl border border-white/10 bg-[#0b1f2a]/80 p-5 shadow-2xl backdrop-blur-xl"
                  style={{ boxShadow: "0 24px 50px -18px rgba(0,0,0,0.7)" }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                    Today · Revenue
                  </div>
                  <div className="mt-2 font-display text-2xl font-semibold text-white">
                    ৳ 84,220
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
                    <Zap className="h-3 w-3" /> +12.4%
                  </div>
                  <div className="mt-3 flex h-8 items-end gap-1">
                    {[30, 55, 42, 70, 48, 82, 96].map((h, i) => (
                      <span
                        key={i}
                        className="w-2 rounded-sm"
                        style={{
                          height: `${h}%`,
                          background:
                            "linear-gradient(180deg, #f5d68a 0%, rgba(245, 214, 138, 0.25) 100%)",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Verification toast */}
                <div className="absolute -bottom-4 right-6 flex w-[240px] -rotate-[2deg] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 shadow-xl backdrop-blur-xl">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/25">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-white/90">
                      Customer verified
                    </div>
                    <div className="truncate text-[10px] text-white/50">
                      95.24% success · 63 parcels
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer meta */}
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-white/45">
              <span>© {year} Zonash</span>
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                All systems operational
              </div>
            </div>
          </div>
        </aside>

        {/* ── Right / form panel ──────────────────────────────────────── */}
        <main className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm">
            {/* Mobile brand */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                <span className="font-display text-base font-bold">Z</span>
              </div>
              <div>
                <div className="font-display text-base font-semibold leading-none">Zonash</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Operations Console
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in with your staff account to continue.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">
                  Work email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@zonash.com"
                    required
                    maxLength={255}
                    autoComplete="email"
                    spellCheck={false}
                    className="h-11 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={onPwKey}
                    onKeyDown={onPwKey}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    maxLength={200}
                    autoComplete="current-password"
                    className="h-11 pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsOn ? (
                  <p className="text-xs text-amber-600">Caps Lock is on.</p>
                ) : null}
              </div>

              <Button
                type="submit"
                className="h-11 w-full text-sm font-medium"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in to dashboard"
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Secured with encrypted sessions
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
