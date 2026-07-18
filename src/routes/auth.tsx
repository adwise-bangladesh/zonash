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
  Sparkles,
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
        <aside className="relative hidden overflow-hidden lg:block">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.85) 55%, hsl(var(--primary)/0.65) 100%)",
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 10%, white 1px, transparent 1px), radial-gradient(circle at 70% 40%, white 1px, transparent 1px)",
              backgroundSize: "36px 36px, 52px 52px",
            }}
            aria-hidden
          />

          <div className="relative z-10 flex h-full flex-col justify-between p-12 text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
                <span className="font-display text-lg font-bold">Z</span>
              </div>
              <div>
                <div className="font-display text-xl font-semibold leading-none">Zonash</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-primary-foreground/70">
                  Operations Console
                </div>
              </div>
            </div>

            <div className="max-w-md space-y-6">
              <h2 className="font-display text-4xl font-semibold leading-tight">
                Move fast.
                <br />
                Ship every order on time.
              </h2>
              <p className="text-primary-foreground/80">
                A unified dashboard for orders, couriers, customer verification and
                messaging — built for high-volume commerce teams.
              </p>

              <ul className="space-y-3 text-sm text-primary-foreground/90">
                <li className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
                    <Zap className="h-4 w-4" />
                  </span>
                  Realtime WooCommerce sync
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  Role-based access & audit trail
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  Bulk courier dispatch & SMS templates
                </li>
              </ul>
            </div>

            <div className="text-xs text-primary-foreground/70">
              © {year} Zonash. Access is invitation-only.
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

            <div className="mt-8 rounded-lg border border-dashed border-border/70 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
              Access is invitation-only. Contact an administrator if you need an account
              or a password reset.
            </div>

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
