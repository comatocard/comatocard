"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { RevealLayer } from "./RevealLayer";

const GRID = 48;

/**
 * The first screen: the portal photo, its glowing twin under a cursor spotlight, a faint grid
 * that drifts against the pointer, and the promise in the lower left.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const pattern = useRef<SVGPatternElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-hero-photo]",
        { opacity: 0 },
        { opacity: 1, duration: 1, ease: EASE.out, delay: 0.1 },
      );
      gsap.fromTo(
        "[data-hero-line]",
        { opacity: 0, y: reduce ? 0 : 24 },
        { opacity: 1, y: 0, duration: 0.9, ease: EASE.out, stagger: 0.18, delay: 0.5 },
      );
    }, el);
    return () => ctx.revert();
  }, []);

  // The grid drifts a few pixels against the pointer, eased so it never snaps.
  useEffect(() => {
    const el = root.current;
    const grid = pattern.current;
    if (!el || !grid || prefersReducedMotion()) return;
    const target = { x: 0, y: 0 };
    const offset = { x: 0, y: 0 };
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 16;
      target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 16;
    };
    const tick = () => {
      offset.x += (target.x - offset.x) * 0.06;
      offset.y += (target.y - offset.y) * 0.06;
      grid.setAttribute("x", String(offset.x));
      grid.setAttribute("y", String(offset.y));
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={root} className="relative h-[100svh] w-full overflow-clip bg-[#0A0B11]">
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[.08]">
        <defs>
          <pattern
            ref={pattern}
            id="hero-grid"
            width={GRID}
            height={GRID}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
      <div
        data-hero-photo
        className="absolute inset-0 bg-cover bg-center opacity-0"
        style={{ backgroundImage: "url(/landing/story-3-portal.jpg)" }}
      />
      <RevealLayer image="/landing/story-4-portal-glow.jpg" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#0A0B11] via-[#0A0B11]/60 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 grid gap-10 px-6 pb-12 sm:px-10 sm:pb-16 md:grid-cols-12 md:items-end md:px-14 md:pb-20">
        <h1
          data-hero-line
          className="font-light text-white opacity-0 md:col-span-7 lg:col-span-8"
          style={{
            fontSize: "clamp(2.2rem, 6.5vw, 5rem)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Give your agents
          <br />a card, not your wallet
        </h1>
        <p
          data-hero-line
          className="max-w-md text-[15px] leading-relaxed text-white/75 opacity-0 sm:text-base md:col-span-5 lg:col-span-4"
        >
          Each agent gets its own card, with limits only you can change.
        </p>
      </div>
    </section>
  );
}
