"use client";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "./gsap";

/** Easing and timing a caller may override. */
type Timing = {
  enter?: number;
  exit?: number;
  duration?: number;
  ease?: string | gsap.EaseFunction;
};

/** Offsets a hidden element can carry. Each one returns to its resting value when shown. */
export type HiddenOffset = { x?: number; y?: number; yPercent?: number; scale?: number };

/** A plain fade: no movement. */
export const FADE: HiddenOffset = {};

/**
 * Shows or hides an element with GSAP: hidden it fades out (`autoAlpha`, so it also leaves the
 * accessibility tree and stops taking pointer events) and moves to `offset`; shown it returns to
 * rest. Reduced motion keeps the fade and drops the movement. The first render jumps straight to
 * its state. Give the element `invisible opacity-0` so it stays hidden before hydration.
 *
 * `offset` must be a stable value (a module constant), or every render restarts the tween.
 */
export function useShowHide(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  offset: HiddenOffset = FADE,
  { enter = DURATION.enter, exit = DURATION.exit, ease = EASE.out }: Timing = {},
) {
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const moves = prefersReducedMotion() ? {} : offset;
    const rest: gsap.TweenVars = { autoAlpha: 1 };
    const hidden: gsap.TweenVars = { autoAlpha: 0 };
    for (const [key, value] of Object.entries(moves)) {
      hidden[key] = value;
      rest[key] = key === "scale" ? 1 : 0;
    }
    const target = open ? rest : hidden;
    if (first.current) {
      first.current = false;
      gsap.set(el, target);
      return;
    }
    const tween = gsap.to(el, { ...target, duration: open ? enter : exit, ease, overwrite: true });
    return () => {
      tween.kill();
    };
  }, [ref, open, offset, enter, exit, ease]);
}

/**
 * Tweens an element to `target` whenever it changes, after jumping there on the first render.
 * Reduced motion jumps every time. `target` may be a fresh object each render: it is compared by
 * value.
 */
export function useTweenTo(
  ref: RefObject<HTMLElement | null>,
  target: Record<string, number | string>,
  { duration = DURATION.enter, ease = EASE.out }: Timing = {},
) {
  const first = useRef(true);
  const key = JSON.stringify(target);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vars = JSON.parse(key) as gsap.TweenVars;
    if (first.current || prefersReducedMotion()) {
      first.current = false;
      gsap.set(el, vars);
      return;
    }
    const tween = gsap.to(el, { ...vars, duration, ease, overwrite: true });
    return () => {
      tween.kill();
    };
  }, [ref, key, duration, ease]);
}

/** Pointer handlers that press an element down to `scale` and let it spring back, with GSAP. */
export function pressHandlers(scale = 0.96) {
  const to = (value: number) => (event: { currentTarget: Element }) => {
    if (prefersReducedMotion()) return;
    gsap.to(event.currentTarget, {
      scale: value,
      duration: DURATION.press,
      ease: EASE.out,
      overwrite: true,
    });
  };
  return {
    onPointerDown: to(scale),
    onPointerUp: to(1),
    onPointerLeave: to(1),
    onPointerCancel: to(1),
  };
}
