"use client";
import { type RefObject, useLayoutEffect } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "./gsap";

/**
 * Staggers the `[data-reveal]` children of `ref` in when `key` changes: 8 px up and a fade, 50 ms
 * apart, so a screen assembles instead of appearing all at once. Interaction is never blocked.
 */
export function useReveal(ref: RefObject<HTMLElement | null>, key: unknown) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // The key is what asked for a new reveal; recording it keeps the run traceable in DevTools.
    root.dataset.revealKey = String(key);
    const items = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (items.length === 0) return;
    const reduce = prefersReducedMotion();
    const tween = gsap.fromTo(
      items,
      { autoAlpha: 0, y: reduce ? 0 : 8 },
      {
        autoAlpha: 1,
        y: 0,
        duration: DURATION.enter,
        ease: EASE.out,
        stagger: 0.05,
        clearProps: "transform",
      },
    );
    return () => {
      tween.kill();
    };
  }, [ref, key]);
}
