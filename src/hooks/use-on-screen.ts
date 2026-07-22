import { useEffect, useState, type RefObject } from "react";

/**
 * Returns `true` once the referenced element enters the viewport, and toggles
 * back to `false` when it leaves. Use to gate expensive intervals / timers so
 * they only run while the section is visible.
 */
export function useOnScreen<T extends Element>(
  ref: RefObject<T | null>,
  rootMargin = "0px",
): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true); // fail-open on unsupported runtimes / SSR
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return visible;
}
