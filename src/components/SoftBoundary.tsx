import { Component, type ReactNode } from "react";

/**
 * Non-critical subtree guard.
 *
 * A suspense query that *rejects* (network drop, aborted server-function call)
 * throws during render. Without a boundary of its own, an optional widget — the
 * shop's category strip, for example — takes the entire route to its
 * `errorComponent`, replacing a perfectly healthy product feed with a full-page
 * "temporarily unavailable" screen.
 *
 * This renders `fallback` (nothing by default) instead, so the page degrades by
 * one widget rather than collapsing.
 */
export class SoftBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
