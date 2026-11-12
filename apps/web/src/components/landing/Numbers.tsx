"use client";
import { useRef } from "react";
import { useCountUp } from "../../lib/motion/scroll";
import { LoopVideo } from "./LoopVideo";

/** Figures from the contract and the chain: each one is a constant in the code or the docs. */
const STATS = [
  { value: 0, unit: "", label: "card keys that can withdraw" },
  { value: 24, unit: "h", label: "for you to approve" },
  { value: 10, unit: "", label: "payments waiting, at most" },
] as const;

function Stat({ value, unit, label }: { value: number; unit: string; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value);
  return (
    <li data-scroll className="text-center">
      <p className="text-[56px] font-semibold tracking-[-.04em] tabular-nums lg:text-[72px]">
        <span ref={ref}>{value}</span>
        <span className="text-faint">{unit}</span>
      </p>
      <p className="text-[13px] text-muted">{label}</p>
    </li>
  );
}

/** How fast and how bounded: finality, then the contract's own limits. */
export function Numbers() {
  return (
    <section className="bg-white px-5 py-24 text-center lg:py-32">
      <p data-scroll className="text-[13px] text-muted">
        Finality
      </p>
      <h2
        data-scroll
        className="mx-auto mt-3 max-w-[560px] text-[36px] font-semibold leading-[1.05] tracking-[-.03em] lg:text-[52px]"
      >
        It settles before you look up
      </h2>
      <p data-scroll className="mt-8 text-[64px] font-semibold tracking-[-.05em] lg:text-[104px]">
        1–2 <span className="text-faint">seconds</span>
      </p>
      <p data-scroll className="text-[14px] text-muted">
        From pay to a recorded decision.
      </p>
      <div data-scroll className="mx-auto mt-6 max-w-[520px]">
        <LoopVideo
          src="/landing/globe.mp4"
          poster="/landing/globe.png"
          className="aspect-video w-full object-contain mix-blend-multiply"
        />
      </div>
      <ul className="mx-auto mt-10 grid max-w-[900px] gap-10 sm:grid-cols-3">
        {STATS.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </ul>
    </section>
  );
}
