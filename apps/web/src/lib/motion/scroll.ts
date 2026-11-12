"use client";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type RefObject, useLayoutEffect } from "react";
import { EASE, gsap, prefersReducedMotion } from "./gsap";

gsap.registerPlugin(ScrollTrigger);

/**
 * Brings each `[data-scroll]` element under `ref` in as it scrolls into view: 24 px up and a fade,
 * batched so a row of items staggers 80 ms apart. Runs once per element; with reduced motion the
 * elements only fade. Opacity alone, never visibility, so content not yet revealed stays in the
 * accessibility tree and in find-in-page.
 */
export function useScrollReveal(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>("[data-scroll]", root);
      gsap.set(items, { opacity: 0, y: reduce ? 0 : 24 });
      ScrollTrigger.batch(items, {
        start: "top 88%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: EASE.out,
            stagger: 0.08,
            clearProps: "transform",
          }),
      });
    }, root);
    return () => ctx.revert();
  }, [ref]);
}

/**
 * A seamless horizontal loop: the track holds its items twice and slides left by one copy, so the
 * seam never shows. Constant motion, so it is linear; it stops under reduced motion.
 */
export function useMarquee(track: RefObject<HTMLElement | null>, secondsPerLoop = 28) {
  useLayoutEffect(() => {
    const el = track.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.to(el, {
      xPercent: -50,
      duration: secondsPerLoop,
      ease: "none",
      repeat: -1,
    });
    return () => {
      tween.kill();
      gsap.set(el, { clearProps: "transform" });
    };
  }, [track, secondsPerLoop]);
}

/** Counts a number up from zero the first time it scrolls into view. */
export function useCountUp(ref: RefObject<HTMLElement | null>, to: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || to === 0) {
      el.textContent = String(to);
      return;
    }
    const state = { value: 0 };
    el.textContent = "0";
    const tween = gsap.to(state, {
      value: to,
      duration: 1.2,
      ease: EASE.out,
      snap: { value: 1 },
      paused: true,
      onUpdate: () => {
        el.textContent = String(state.value);
      },
    });
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 90%",
      once: true,
      onEnter: () => tween.play(),
    });
    return () => {
      trigger.kill();
      tween.kill();
    };
  }, [ref, to]);
}

/** Slow float and tilt for the 3D icons under `ref`, each out of phase with the next. */
export function useFloat(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-float]", root).forEach((el, i) => {
        gsap.to(el, {
          y: -10,
          rotation: i % 2 === 0 ? 3 : -3,
          duration: 2.8 + (i % 3) * 0.4,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: i * 0.3,
        });
      });
    }, root);
    return () => ctx.revert();
  }, [ref]);
}
