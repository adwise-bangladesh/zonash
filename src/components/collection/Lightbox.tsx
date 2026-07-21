import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function Lightbox({
  title,
  images,
  onClose,
}: {
  title: string;
  images: { src: string; alt?: string }[];
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const total = images.length;
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => (v + 1) % Math.max(total, 1));
      if (e.key === "ArrowLeft")
        setI((v) => (v - 1 + Math.max(total, 1)) % Math.max(total, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [total, onClose]);

  if (typeof document === "undefined") return null;
  if (total === 0) return null;

  const go = (dir: 1 | -1) => setI((v) => (v + dir + total) % total);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} images`}
      className="fixed inset-0 z-[100] animate-fade-in bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative mx-auto flex h-full w-full max-w-[480px] items-center justify-center">
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">{title}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/60">
              {i + 1} / {total}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close preview"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 transition hover:bg-white/25 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="relative z-10 h-full w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          <div
            className="flex h-full w-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${i * 100}%)` }}
          >
            {images.map((img, idx) => (
              <div
                key={idx}
                className="flex h-full w-full shrink-0 items-center justify-center px-4 py-16"
              >
                <img
                  src={img.src}
                  alt={img.alt || `${title} ${idx + 1}`}
                  className="max-h-full max-w-full animate-scale-in rounded-xl object-contain shadow-2xl"
                  draggable={false}
                />
              </div>
            ))}
          </div>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 active:scale-95"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                aria-label="Next image"
                className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 active:scale-95"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {total > 1 && (
          <div
            className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`Go to image ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  idx === i ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
