import { Component, Fragment, type ReactNode } from "react";

type Fallback = ReactNode | ((retry: () => void) => ReactNode);

/**
 * Non-critical subtree guard.
 *
 * A suspense query that *rejects* (network drop, aborted server-function call,
 * WooCommerce 5xx) throws during render. Without a boundary of its own, an
 * optional widget — the deals strip, the recommended feed — takes the entire
 * route to its `errorComponent`, replacing a perfectly healthy page with a
 * full-page "temporarily unavailable" screen.
 *
 * This renders `fallback` (nothing by default) instead, so the page degrades by
 * one widget rather than collapsing. Pass a function to receive a `retry`
 * callback that clears the failed state and re-mounts the subtree.
 */
export class SoftBoundary extends Component<
  { children: ReactNode; fallback?: Fallback; label?: string },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Swallowing silently makes production failures invisible; keep a single
    // line of breadcrumb without leaking payloads.
    console.error(
      `[SoftBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
      error instanceof Error ? error.message : error,
    );
  }

  retry = () => {
    // Bumping `attempt` changes the child key, so the subtree remounts and its
    // suspense query is read again instead of replaying the cached throw.
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  render() {
    const { fallback, children } = this.props;
    if (this.state.failed) {
      return typeof fallback === "function" ? fallback(this.retry) : (fallback ?? null);
    }
    // Fragment (not a wrapper element) keeps the parent grid/flex layout intact.
    return <Fragment key={this.state.attempt}>{children}</Fragment>;
  }
}
