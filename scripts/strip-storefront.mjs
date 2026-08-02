#!/usr/bin/env node
/**
 * strip-storefront.mjs — produce an admin/dashboard-only tree.
 *
 * Mirror image of scripts/strip-admin.mjs. Run it in a REMIX (copy) of this
 * project to turn that copy into the standalone staff dashboard:
 *
 *   node scripts/strip-storefront.mjs          # dry run — lists what would go
 *   node scripts/strip-storefront.mjs --apply  # actually delete + rewrite
 *
 * After --apply:
 *   bun install && bunx tsgo --noEmit && bun run build
 *
 * Both projects keep talking to the SAME backend and the same WooCommerce
 * store, so nothing here touches the database.
 */
import {
  existsSync,
  rmSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();

/** Customer-facing surfaces. Everything a staff member never opens. */
const TARGETS = [
  // Storefront routes.
  "src/routes/index.tsx",
  "src/routes/c.$slug.tsx",
  "src/routes/cart.tsx",
  "src/routes/categories.tsx",
  "src/routes/checkout.tsx",
  "src/routes/collection.$slug.tsx",
  "src/routes/luxury.tsx",
  "src/routes/orders.tsx",
  "src/routes/order-blocked.tsx",
  "src/routes/order-callback-choice.tsx",
  "src/routes/order-confirmed.tsx",
  "src/routes/order-pending.tsx",
  "src/routes/order-review.tsx",
  "src/routes/products.$slug.tsx",
  "src/routes/products.index.tsx",
  "src/routes/search.tsx",
  "src/routes/step.$slug.tsx",
  "src/routes/step.index.tsx",
  "src/routes/support.tsx",
  "src/routes/verify-otp.tsx",
  "src/routes/_authenticated/account.orders.tsx",
  "src/routes/robots[.]txt.ts",
  "src/routes/sitemap[.]xml.ts",

  // Storefront-only UI.
  "src/components/home",
  "src/components/plp",
  "src/components/product",
  "src/components/products",
  "src/components/collection",
  "src/components/AppHeader.tsx",
  "src/components/layout/MobileBottomNav.tsx",
  "src/components/layout/SiteHeader.tsx",
  "src/components/layout/SiteFooter.tsx",
  "src/components/layout/CheckoutHeader.tsx",
  "src/components/layout/useSearchSuggest.ts",
  "src/components/checkout/AuthUi.tsx",
  "src/components/checkout/FlowIcon.tsx",
  "src/components/checkout/OrderSummaryCard.tsx",
  "src/components/checkout/SupportFooter.tsx",

  // Storefront-only logic. (woo/*, format, customer-history
  // and the Steadfast/Hoorin/SMS layers stay — the dashboard uses them.)
  "src/lib/home-feed.ts",
  "src/lib/home-feed.test.ts",
  "src/lib/recommended-feed.ts",
  "src/lib/recent-searches.ts",
  "src/lib/seed-product-cache.ts",
  "src/lib/step-reviews.ts",
  "src/lib/price-range.entity.test.ts",

  // Storefront deployment scaffolding.
  "scripts/strip-admin.mjs",
  "scripts/loadtest.js",
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  "DEPLOY.md",
];

/** Dashboard-only 404 screen: the storefront one pulls in the shop header. */
const NOT_FOUND_VIEW = `import { Link } from "@tanstack/react-router";

export function NotFoundView({
  variant = "not-found",
  title,
  description,
  onRetry,
}: {
  variant?: "not-found" | "error";
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const isError = variant === "error";
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-muted/30 px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {title ?? (isError ? "Something went wrong" : "Page not found")}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {description ??
            (isError
              ? "This screen failed to load. Try again or return to the console."
              : "That screen does not exist in the operations console.")}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-border px-3 py-2 text-[12px] font-semibold"
            >
              Try again
            </button>
          )}
          <Link
            to="/admin"
            className="rounded-md bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
`;

/** After deleting `/`, the dashboard needs its own root route. */
const INDEX_ROUTE = `import { createFileRoute, redirect } from "@tanstack/react-router";

/** Dashboard-only build: "/" is just a doorway to the console. */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
`;

function scanSources() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  return files;
}

const removedPaths = TARGETS.map((t) => join(ROOT, t)).filter((p) => existsSync(p));
const removedRel = new Set(removedPaths.map((p) => relative(ROOT, p)));

// The root layout renders the storefront bottom nav; that goes with the split.
const ROOT_ROUTE = join(ROOT, "src/routes/__root.tsx");
function patchRootRoute(apply) {
  if (!existsSync(ROOT_ROUTE)) return false;
  const src = readFileSync(ROOT_ROUTE, "utf8");
  const next = src
    .split("\n")
    .filter((line) => !line.includes("MobileBottomNav"))
    .join("\n");
  if (next === src) return false;
  if (apply) writeFileSync(ROOT_ROUTE, next);
  return true;
}

const survivors = scanSources().filter((f) => {
  const rel = relative(ROOT, f);
  if (
    rel === "src/routes/__root.tsx" ||
    rel === "src/routes/index.tsx" ||
    rel === "src/components/NotFoundView.tsx"
  )
    return false;
  return ![...removedRel].some((r) => rel === r || rel.startsWith(`${r}/`));
});

const stems = [...removedRel]
  .filter((r) => r.startsWith("src/"))
  .map((r) => r.replace(/^src\//, "@/").replace(/\.(ts|tsx)$/, ""));

const dangling = [];
for (const f of survivors) {
  const src = readFileSync(f, "utf8");
  for (const stem of stems) {
    if (src.includes(stem)) dangling.push(`${relative(ROOT, f)} -> ${stem}`);
  }
}

console.log(`${APPLY ? "Removing" : "Would remove"} ${removedPaths.length} path(s):`);
for (const p of removedPaths) console.log(`  - ${relative(ROOT, p)}`);
if (patchRootRoute(false)) console.log("  ~ src/routes/__root.tsx (drop MobileBottomNav)");
console.log("  + src/routes/index.tsx (redirect / -> /admin)");
console.log("  + src/components/NotFoundView.tsx (dashboard 404)");

if (dangling.length) {
  console.error("\nBlocked: staff-facing files still import storefront-only modules:");
  for (const d of dangling) console.error(`  ! ${d}`);
  console.error("\nExtract the shared part into src/lib/ first, then re-run.");
  process.exit(1);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to delete.");
  process.exit(0);
}

for (const p of removedPaths) rmSync(p, { recursive: true, force: true });
patchRootRoute(true);
writeFileSync(join(ROOT, "src/routes/index.tsx"), INDEX_ROUTE);
writeFileSync(join(ROOT, "src/components/NotFoundView.tsx"), NOT_FOUND_VIEW);
console.log("\nDone. Now run: bun install && bun run build");
