"use client";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

/**
 * The app's GSAP eases. The built-in power curves are too soft for UI: these start fast, so a
 * moving element answers the tap at once.
 */
export const EASE = {
  /** Enter and exit. */
  out: CustomEase.create("comato-out", "0.23,1,0.32,1"),
  /** Something already on screen moving or morphing. */
  inOut: CustomEase.create("comato-in-out", "0.77,0,0.175,1"),
  /** Sheets and panels. */
  drawer: CustomEase.create("comato-drawer", "0.32,0.72,0,1"),
} as const;

/** Seconds. UI motion stays under 0.3 s; the card build is the one deliberate exception. */
export const DURATION = {
  press: 0.14,
  exit: 0.18,
  enter: 0.28,
  height: 0.32,
  build: 0.45,
} as const;

/** True when the visitor asked the system for less motion: keep fades, drop movement. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export { gsap };
