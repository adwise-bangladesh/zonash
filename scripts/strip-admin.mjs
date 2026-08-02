#!/usr/bin/env node
/**
 * strip-admin.mjs — produce a storefront-only tree.
 *
 * The Lovable project holds BOTH the customer storefront and the staff
 * dashboard. The self-hosted repo (zonash-storefront) should ship only
 * customer-facing code: less attack surface, smaller bundle, and no staff
 * login exposed on the public server.
 *
 * Run from the repo root of the storefront checkout:
 *
 *   node scripts/strip-admin.mjs          # dry run — lists what would go
 *   node scripts/strip-admin.mjs --apply  # actually delete
 *
 * After --apply, run `bunx tsgo --noEmit` (or `bun run build`). Any error
 * means something customer-facing still imports a removed module — move that
 * code into a shared lib instead of un-deleting the admin file.
 *
 * NOTE: the dashboard keeps living in the Lovable project against the SAME
 * backend, so nothing here touches the database or WooCommerce.
 */
import { existsSync, rmSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();

/** Staff-only surfaces. Everything a customer never sees. */
const TARGETS = [
  // Dashboard routes + the staff login page.
  "src/routes/_authenticated/admin",
  "src/routes/auth.tsx",
  // Dashboard-only UI.
  "src/components/admin",
  // Dashboard-only server functions.
  "src/lib/pos.functions.ts",
  "src/lib/users.functions.ts",
  "src/lib/backfill.functions.ts",
  "src/lib/templates.functions.ts",
  "src/lib/ops.functions.ts",
  // Load-test harness — never ship to production.
  "scripts/loadtest.js",
];

/** Customer-facing code must never import these. Checked before deleting. */
function scanSources() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else if (/\.(ts|tsx)$/.test(p)) {
        files.push(p);
      }
    }
  };
  walk(join(ROOT, "src"));
  return files;
}

const removedPaths = TARGETS.map((t) => join(ROOT, t)).filter((p) => existsSync(p));
const removedRel = new Set(removedPaths.map((p) => relative(ROOT, p)));

// Detect survivors that still reference a removed module.
const survivors = scanSources().filter((f) => {
  const rel = relative(ROOT, f);
  return ![...removedRel].some((r) => rel === r || rel.startsWith(`${r}/`));
});

const stems = [...removedRel].map((r) =>
  r.replace(/^src\//, "@/").replace(/\.(ts|tsx)$/, ""),
);
const dangling = [];
for (const f of survivors) {
  const src = readFileSync(f, "utf8");
  for (const stem of stems) {
    if (src.includes(stem)) dangling.push(`${relative(ROOT, f)} -> ${stem}`);
  }
}

console.log(`${APPLY ? "Removing" : "Would remove"} ${removedPaths.length} path(s):`);
for (const p of removedPaths) console.log(`  - ${relative(ROOT, p)}`);

if (dangling.length) {
  console.error("\nBlocked: customer-facing files still import staff-only modules:");
  for (const d of dangling) console.error(`  ! ${d}`);
  console.error("\nExtract the shared part into src/lib/ first, then re-run.");
  process.exit(1);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to delete.");
  process.exit(0);
}

for (const p of removedPaths) rmSync(p, { recursive: true, force: true });
console.log("\nDone. Now run: bun run build");
