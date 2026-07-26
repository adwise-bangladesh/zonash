/**
 * Native-app navigation feel, built on the View Transitions API.
 *
 * Two things make a web navigation read as "app-like" rather than "page load":
 *
 *  1. **Direction.** A push (drilling into a product) slides in from the right;
 *     a pop (going back) slides in from the left. A single direction-agnostic
 *     cross-fade is the tell that gives away a website. The direction lives in
 *     `<html data-nav>` so plain CSS can pick the right keyframes — we don't use
 *     view-transition *types* because `popstate` navigations are started by the
 *     router, not by us, so we can't attach a type to them.
 *
 *  2. **A shared element.** Tapping a product card should morph that card's
 *     image into the product hero instead of replacing the whole screen. The
 *     browser does this automatically for two elements that share a
 *     `view-transition-name` across the transition.
 *
 * The shared name is applied **imperatively on tap** rather than declaratively
 * in the card's JSX. That is deliberate: `view-transition-name` must be unique
 * among rendered elements, and the same product legitimately appears twice on
 * the homepage (e.g. in Mega Sale *and* in the infinite feed). Two elements
 * carrying the name aborts the entire transition — including the page slide —
 * so the animation would break exactly on the pages that need it most.
 */

const HERO_NAME = "product-hero";
/** Longest page animation in styles.css (navPushIn) plus headroom. */
const CLEANUP_MS = 420;

let popstateBound = false;
let clearDirTimer: ReturnType<typeof setTimeout> | undefined;
let markedHero: HTMLElement | null = null;

function canAnimate(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Sets the slide direction for the next navigation. Defaults back to "forward"
 * shortly after, so a navigation we don't explicitly mark (a nav-bar tap, a
 * redirect) animates as a push rather than inheriting a stale "back".
 */
export function setNavDirection(dir: "forward" | "back" | "hero"): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.nav = dir;
  if (clearDirTimer) clearTimeout(clearDirTimer);
  clearDirTimer = setTimeout(() => {
    document.documentElement.dataset.nav = "forward";
  }, CLEANUP_MS);
}


/**
 * Browser/gesture back must animate as a pop. `popstate` fires before the
 * router commits the new location, so setting the attribute here lands before
 * the transition snapshot is taken.
 */
export function installBackGestureListener(): () => void {
  if (typeof window === "undefined" || popstateBound) return () => {};
  popstateBound = true;
  const onPop = () => setNavDirection("back");
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    popstateBound = false;
  };
}

/**
 * Tags the tapped card image so it morphs into the product hero. Only ever one
 * element at a time — the previous tag is released first, because a card that
 * stays mounted (back-navigation into a cached grid) would otherwise collide
 * with the next tap's element and silently kill the transition.
 */
export function markSharedHero(el: HTMLElement | null | undefined): void {
  if (!canAnimate()) return;
  releaseSharedHero();
  if (!el) return;
  el.style.viewTransitionName = HERO_NAME;
  markedHero = el;
  // The element usually unmounts with the outgoing page, but not always: the
  // shop grid stays mounted behind a modal-ish route in some flows. Releasing
  // on a timer guarantees we never leave a duplicate name behind.
  setTimeout(releaseSharedHero, CLEANUP_MS);
}

export function releaseSharedHero(): void {
  if (markedHero) {
    markedHero.style.viewTransitionName = "";
    markedHero = null;
  }
}

/**
 * Convenience for product-card links: marks direction + shared element from the
 * event target. Attach to `onPointerDown` so the DOM write happens before the
 * router starts the transition on click.
 */
export function beginProductPush(el: HTMLElement | null | undefined): void {
  setNavDirection("forward");
  markSharedHero(el);
}
