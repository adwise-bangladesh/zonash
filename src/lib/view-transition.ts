/**
 * View Transitions helper.
 *
 * Wraps a client-side navigation in `document.startViewTransition` so that a
 * source element (e.g. a product card image) morphs smoothly into a matching
 * destination element (the product hero image) that shares the same
 * `view-transition-name`.
 *
 * - No-ops on browsers that don't support the API (falls back to instant nav).
 * - Respects `prefers-reduced-motion`.
 * - Restores any prior inline `viewTransitionName` after the transition ends.
 */
type StartViewTransition = (cb: () => void | Promise<void>) => {
  finished: Promise<void>;
  ready: Promise<void>;
};

function getStartViewTransition(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const d = document as unknown as { startViewTransition?: StartViewTransition };
  return typeof d.startViewTransition === "function" ? d.startViewTransition.bind(document) : null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface TransitionOptions {
  /** Element on the current page to tag as the "from" for the morph. */
  sourceEl?: HTMLElement | null;
  /** The transition name to apply — must match the destination element. */
  name?: string;
}

/**
 * Run `navigate` inside a view transition. `navigate` may return a Promise;
 * the transition waits for it (and for React to commit) before snapshotting
 * the destination.
 */
export function navigateWithTransition(
  navigate: () => void | Promise<unknown>,
  options: TransitionOptions = {},
): void {
  const start = getStartViewTransition();
  if (!start || prefersReducedMotion()) {
    void navigate();
    return;
  }
  const { sourceEl, name = "product-hero" } = options;
  const prev = sourceEl?.style.viewTransitionName ?? "";
  if (sourceEl) sourceEl.style.viewTransitionName = name;

  const tx = start(async () => {
    await navigate();
    // Give React one frame to commit the new route before the browser
    // captures the destination snapshot.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });

  tx.finished.finally(() => {
    if (sourceEl) sourceEl.style.viewTransitionName = prev;
  });
}
