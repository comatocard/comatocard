"use client";
import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "./gsap";

const SHIFT = 16;

/**
 * Moves a panel between steps: the old content leaves 16 px toward where it is going and fades,
 * the new one arrives from the other side, with a 2 px blur that hides the crossfade. Exit is
 * faster than enter. `swap(next, apply)` runs the exit, then `apply` to change the step.
 *
 * The panel must never be left hidden: a swap to the step already shown, or a second swap while
 * one is running, is ignored, and an entrance cut short jumps to its end instead of stopping.
 */
export function useStepSwap(ref: RefObject<HTMLElement | null>, step: number) {
  const direction = useRef<1 | -1>(1);
  const first = useRef(true);
  const swapping = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.step = String(step);
    swapping.current = false;
    if (first.current) {
      first.current = false;
      return;
    }
    const reduce = prefersReducedMotion();
    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, x: reduce ? 0 : direction.current * SHIFT, filter: "blur(2px)" },
      {
        autoAlpha: 1,
        x: 0,
        filter: "blur(0px)",
        duration: DURATION.enter,
        ease: EASE.out,
        overwrite: true,
        clearProps: "filter,transform",
      },
    );
    return () => {
      tween.progress(1).kill();
    };
  }, [ref, step]);

  return useCallback(
    (next: number, apply: () => void) => {
      if (next === step || swapping.current) return;
      const el = ref.current;
      direction.current = next > step ? 1 : -1;
      if (!el || prefersReducedMotion()) {
        apply();
        return;
      }
      swapping.current = true;
      gsap.to(el, {
        autoAlpha: 0,
        x: -direction.current * SHIFT,
        duration: DURATION.exit,
        ease: EASE.out,
        overwrite: true,
        onComplete: apply,
      });
    },
    [ref, step],
  );
}
