"use client";
import { Check } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { SETUP_STEPS } from "../../lib/setup-flow";
import { cn } from "../../lib/utils";

/**
 * Three segments that fill left to right as setup moves on. The fill is a scaleX on its own layer,
 * so it animates on the compositor and never reflows the bar.
 */
export function SetupProgress({ step }: { step: number }) {
  const fills = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const tween = gsap.to(fills.current, {
      scaleX: (i: number) => (i <= step ? 1 : 0),
      duration: reduce ? 0 : DURATION.height,
      ease: EASE.out,
      stagger: 0.04,
    });
    return () => {
      tween.kill();
    };
  }, [step]);

  return (
    <div
      className="flex flex-1 items-center gap-1.5"
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={0}
      aria-valuemax={SETUP_STEPS.length}
      aria-valuenow={Math.min(step + 1, SETUP_STEPS.length)}
    >
      {SETUP_STEPS.map((name, i) => (
        <span key={name} className="relative h-1 flex-1 overflow-hidden rounded-full bg-line-2">
          <span
            ref={(el) => {
              fills.current[i] = el;
            }}
            className="absolute inset-0 origin-left scale-x-0 rounded-full bg-ink"
          />
        </span>
      ))}
    </div>
  );
}

/** The desktop panel's list of steps: done ones get a check, the current one is bright. */
export function SetupStepList({ step }: { step: number }) {
  return (
    <ol className="space-y-3.5">
      {SETUP_STEPS.map((name, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={name}
            className={cn(
              "flex items-center gap-3 text-[15px] text-white transition-opacity duration-300",
              done || current ? "opacity-100" : "opacity-45",
              current ? "font-semibold" : "font-medium",
            )}
            aria-current={current ? "step" : undefined}
          >
            <span
              className={cn(
                "grid size-[26px] place-items-center rounded-full text-[12px] font-bold transition-colors duration-300 [&_svg]:size-3.5",
                stepDotTone(done, current),
              )}
            >
              {done ? <Check strokeWidth={3} /> : i + 1}
            </span>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

function stepDotTone(done: boolean, current: boolean): string {
  if (done) return "bg-pos text-white";
  if (current) return "bg-[#f8f8f8] text-[#0b0c0d]";
  return "border border-white/20 bg-white/[.08] text-white/70";
}
