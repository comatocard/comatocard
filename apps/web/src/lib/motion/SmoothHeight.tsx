"use client";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "./gsap";

/**
 * Tweens its own height whenever its content grows or shrinks, then returns to `auto`, so a
 * message, an error line or a new row never makes the layout jump. The outer box carries no
 * padding: padding on it would be measured twice.
 */
export function SmoothHeight({ children, className }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content || typeof ResizeObserver === "undefined") return;
    let last = content.offsetHeight;
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      if (next === last) return;
      const from = last;
      last = next;
      if (prefersReducedMotion()) return;
      gsap.killTweensOf(box);
      gsap.fromTo(
        box,
        { height: from },
        {
          height: next,
          duration: DURATION.height,
          ease: EASE.inOut,
          overwrite: true,
          onComplete: () => {
            box.style.height = "auto";
          },
        },
      );
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      gsap.killTweensOf(box);
    };
  }, []);

  return (
    <div ref={outer} className={className} style={{ overflow: "clip" }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
