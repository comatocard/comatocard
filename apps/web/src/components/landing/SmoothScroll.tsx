"use client";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, prefersReducedMotion } from "../../lib/motion/gsap";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

gsap.registerPlugin(ScrollTrigger);

/**
 * Weighted smooth scrolling for the landing page. A long duration and a soft exponential ease
 * make the wheel feel heavy rather than jumpy. Lenis drives the native scroll position, so the
 * intro (which reads wheel deltas and `scrollY`) keeps working, and it is wired to GSAP's ticker
 * so ScrollTrigger reveals stay in step. Reduced motion keeps native scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({
      duration: 1.5,
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      wheelMultiplier: 0.8,
      touchMultiplier: 1.2,
      smoothWheel: true,
    });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete window.__lenis;
    };
  }, []);
  return null;
}
