"use client";
import { useRef } from "react";
import { useCountUp } from "../../lib/motion/scroll";
import { HEADLINE, INK } from "./links";

/** Each figure is a constant in the vault contract or the docs; change them together. */
const STATS = [
  { value: 0, suffix: "", label: "Agents that can take money out" },
  { value: 24, suffix: " h", label: "To approve a big payment" },
  { value: 10, suffix: "", label: "Payments that can wait for you" },
] as const;

function Stat({ value, suffix, label }: (typeof STATS)[number]) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value);
  return (
    <div data-scroll className="flex flex-col gap-3">
      <span className="text-[40px] leading-[0.9] font-light tracking-[-0.03em] text-[#18161B] tabular-nums md:text-[68px]">
        <span ref={ref}>{value}</span>
        <span className="text-[#18161B]/40">{suffix}</span>
      </span>
      <p className="text-base leading-snug text-[#18161B]/50 md:text-lg">{label}</p>
    </div>
  );
}

/** How fast and how bounded: finality on NEAR over the globe, then the contract's own limits. */
export function Finality() {
  return (
    <section className="overflow-hidden pt-[130px] md:pt-[200px]">
      <div className="mx-auto flex max-w-[1260px] flex-col items-center gap-[60px] px-6 text-center">
        <div className="flex max-w-[560px] flex-col items-center gap-5">
          <span
            data-scroll
            className="rounded-full border border-[#18161B]/10 bg-white px-4 py-2 text-[13px] text-[#18161B]/60"
          >
            Speed
          </span>
          <h2 data-scroll className={`font-light ${INK}`} style={HEADLINE}>
            It settles before you look up
          </h2>
          <span
            data-scroll
            className="mt-2 text-[60px] leading-none font-light tracking-[-0.03em] text-[#18161B] md:text-[100px] lg:text-[120px]"
          >
            1–2<span className="text-[#18161B]/40"> s</span>
          </span>
          <p data-scroll className="text-base text-[#18161B]/50 md:text-lg">
            From tap to done
          </p>
        </div>
        <div className="relative w-full max-w-[1080px]">
          <div className="h-[280px] overflow-hidden md:h-[440px]">
            <video
              ref={(el) => {
                if (el) el.muted = true;
              }}
              className="h-[500px] w-full object-cover md:h-[800px]"
              style={{ mixBlendMode: "darken" }}
              poster="/landing/globe.png"
              autoPlay
              loop
              muted
              playsInline
              tabIndex={-1}
            >
              <source src="/landing/globe.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#F4F0ED]" />
        </div>
        <div className="grid w-full max-w-[840px] grid-cols-1 gap-8 text-left sm:grid-cols-3 md:gap-[50px]">
          {STATS.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}
