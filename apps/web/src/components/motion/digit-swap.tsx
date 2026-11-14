"use client";
// Adapted from beUI (https://beui.dev/components/blocks/card-folder), MIT, with the motion moved
// to GSAP. Product styling lives in components/card/.

import { useLayoutEffect, useRef, useState } from "react";
import { EASE, gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

export type DigitSwapDirection = "up" | "down";

export interface DigitSwapProps {
  /** Numeric or masked value rendered in fixed character slots. */
  value: string | number;
  /** Replays every glyph when the value itself contains unchanged characters. */
  animationKey?: string | number;
  /** Direction the next glyph enters from. */
  direction?: DigitSwapDirection;
  /** Per-glyph transition duration in seconds. */
  duration?: number;
  /** Delay in seconds between neighboring glyphs. */
  stagger?: number;
  /** Number of final characters that receive `suffixClassName`. */
  suffixLength?: number;
  className?: string;
  glyphClassName?: string;
  suffixClassName?: string;
}

/** Fixed-slot digits and mask glyphs that roll when their value changes. */
export function DigitSwap({
  value,
  animationKey,
  direction = "up",
  duration = 0.18,
  stagger = 0.006,
  suffixLength = 0,
  className,
  glyphClassName,
  suffixClassName,
}: DigitSwapProps) {
  const text = String(value);
  const suffixStart = Math.max(0, text.length - Math.max(0, suffixLength));

  return (
    <span
      data-slot="digit-swap"
      data-direction={direction}
      className={cn("inline-flex items-center whitespace-nowrap", className)}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex items-center">
        {Array.from(text, (character, position) => {
          const id = `glyph-${position}`;
          if (character === " ") {
            return <span key={id} className="inline-block w-[0.7ch]" />;
          }
          return (
            <Glyph
              key={id}
              character={character}
              swapKey={`${character}-${animationKey ?? ""}`}
              direction={direction}
              duration={duration}
              delay={position * stagger}
              className={cn(glyphClassName, position >= suffixStart ? suffixClassName : undefined)}
            />
          );
        })}
      </span>
    </span>
  );
}

type Face = { key: string; character: string; className: string | undefined };

const FACE = "absolute inset-0 flex items-center justify-center leading-none";

/**
 * One character slot. When its key changes, the old face rolls out along `direction` while the
 * new one rolls in behind it; reduced motion only crossfades, quicker and without the stagger.
 */
function Glyph({
  character,
  swapKey,
  direction,
  duration,
  delay,
  className,
}: {
  character: string;
  swapKey: string;
  direction: DigitSwapDirection;
  duration: number;
  delay: number;
  className: string | undefined;
}) {
  const [face, setFace] = useState<Face>({ key: swapKey, character, className });
  const [leaving, setLeaving] = useState<Face | null>(null);
  const enter = useRef<HTMLSpanElement>(null);
  const exit = useRef<HTMLSpanElement>(null);

  // A new key keeps the old face for its exit; derived during render, so both faces paint at once.
  if (face.key !== swapKey) {
    setLeaving(face);
    setFace({ key: swapKey, character, className });
  } else if (face.className !== className) {
    setFace({ ...face, className });
  }

  useLayoutEffect(() => {
    if (!leaving) return;
    const reduce = prefersReducedMotion();
    const shift = reduce ? 0 : 45;
    const from = direction === "up" ? shift : -shift;
    const timing = {
      duration: reduce ? Math.min(duration, 0.12) : duration,
      delay: reduce ? 0 : delay,
      ease: EASE.out,
    };
    const timeline = gsap.timeline({ onComplete: () => setLeaving(null) });
    timeline.fromTo(
      enter.current,
      { autoAlpha: 0, yPercent: from },
      { autoAlpha: 1, yPercent: 0, ...timing },
      0,
    );
    timeline.to(exit.current, { autoAlpha: 0, yPercent: -from, ...timing }, 0);
    return () => {
      timeline.kill();
    };
  }, [leaving, direction, duration, delay]);

  return (
    <span
      data-slot="digit-swap-glyph"
      className="relative inline-block h-[1.1em] w-[1ch] shrink-0 overflow-hidden align-bottom"
    >
      {leaving ? (
        <span ref={exit} className={cn(FACE, leaving.className)}>
          {leaving.character}
        </span>
      ) : null}
      <span ref={enter} className={cn(FACE, face.className)}>
        {face.character}
      </span>
    </span>
  );
}
