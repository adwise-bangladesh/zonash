import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

function HeroCartN({ size = 52 }: { size?: number }) {
  const stroke = 2.4;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="text-white">
      <path d="M3 7 H7 L9 11" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 24 V14 Q8 11 11 11 H22 Q25 11 25 14 V24" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 14.5 L22 18 L14 21.5 Z" fill="currentColor" />
      <circle cx="11" cy="27" r="1.8" fill="currentColor" />
      <circle cx="22" cy="27" r="1.8" fill="currentColor" />
    </svg>
  );
}

function PlayfulText({ text, delayOffset = 0 }: { text: string; delayOffset?: number }) {
  return (
    <>
      {text.split("").map((ch, i) => (
        <span
          key={i}
          className="hero-letter"
          style={{
            animationDelay: `${(i + delayOffset) * 0.12}s, ${(i + delayOffset) * 0.2}s`,
            whiteSpace: ch === " " ? "pre" : undefined,
          }}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

export function HomeHero({ chips = [] as { name: string; slug: string }[] }) {
  return (
    <section aria-label="Hero" className="relative overflow-hidden bg-ink">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster="https://images.pexels.com/videos/6238179/free-video-6238179.jpg?auto=compress&cs=tinysrgb&w=1280"
        aria-hidden="true"
      >
        <source
          src="https://videos.pexels.com/video-files/6238179/6238179-hd_1920_1080_25fps.mp4"
          type="video/mp4"
        />
      </video>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.9) 100%)",
        }}
      />

      <div className="container-page relative flex min-h-[340px] flex-col items-center justify-center py-10 text-center md:min-h-[460px] md:py-16 lg:min-h-[520px]">
        <span className="inline-flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          New season · Fine jewelry
        </span>

        <div className="mt-3 md:mt-4">
          <HeroCartN size={56} />
        </div>

        <h1
          className="mt-2 max-w-3xl font-display text-4xl font-extrabold leading-[1] tracking-tight text-white md:mt-3 md:text-6xl lg:text-7xl"
          style={{ textShadow: "0 2px 18px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.35)" }}
        >
          <PlayfulText text="wear the story" />
        </h1>

        <p
          className="mt-4 max-w-xl text-sm font-medium text-white/90 md:text-base"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}
        >
          Handcrafted heirloom jewelry — waterproof, skin-safe, made to be lived in.
        </p>

        {chips.length > 0 && (
          <div className="mt-6 w-full max-w-2xl">
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden justify-center flex-wrap">
              {chips.slice(0, 6).map((cat) => (
                <Link
                  key={cat.slug}
                  to="/products"
                  search={{ category: cat.slug }}
                  preload="intent"
                  className="shrink-0 snap-start truncate rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-center text-[12px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 md:text-[13px]"
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <Link
          to="/products"
          className="mt-6 inline-flex items-center gap-2 rounded-[3px] bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
        >
          Shop the collection
        </Link>
      </div>
    </section>
  );
}
