"use client";
import { useLayoutEffect, useRef } from "react";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { RevealLayer } from "./RevealLayer";

const HEADLINE = {
  fontSize: "clamp(2rem, 7vw, 5.5rem)",
  lineHeight: 0.95,
  letterSpacing: "-0.03em",
};

/**
 * What the intro video lands on: the card, its living twin under the cursor spotlight, and the
 * two halves of the idea in opposite corners. It sits behind the video and comes up while the
 * video is still playing, so the hand-over has no gap.
 */
export function CardScene({
  visible,
  imagesVisible,
}: {
  visible: boolean;
  imagesVisible: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const images = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      gsap.to(el, { opacity: visible ? 1 : 0, duration: 0.7, ease: EASE.out });
      if (visible) {
        gsap.fromTo(
          "[data-scene-line]",
          { opacity: 0, y: reduce ? 0 : 24 },
          { opacity: 1, y: 0, duration: 0.9, ease: EASE.out, stagger: 0.2, delay: 0.15 },
        );
      } else {
        gsap.set("[data-scene-line]", { opacity: 0 });
      }
    }, el);
    return () => ctx.revert();
  }, [visible]);

  useLayoutEffect(() => {
    const tween = gsap.to(images.current, {
      opacity: imagesVisible ? 1 : 0,
      duration: 0.7,
      ease: EASE.out,
    });
    return () => {
      tween.kill();
    };
  }, [imagesVisible]);

  return (
    <section
      ref={root}
      aria-label="One account, many cards"
      className="absolute inset-0 z-[1] h-[100svh] overflow-hidden bg-[#F4F0ED] opacity-0"
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className="font-medium uppercase text-[#18161B]/[0.04]"
          style={{ fontSize: "clamp(4rem, 15vw, 14rem)", letterSpacing: "-0.02em" }}
        >
          Comatocard
        </span>
      </div>
      <div ref={images} className="absolute inset-0 opacity-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/landing/story-1-card.jpg)" }}
        />
        <RevealLayer image="/landing/story-2-alive.jpg" />
      </div>
      <div className="absolute inset-x-0 top-0 px-5 pt-24 sm:px-10 sm:pt-28 md:px-14 md:pt-32">
        <h2 data-scene-line className="font-light text-[#18161B] opacity-0" style={HEADLINE}>
          Fund Once
        </h2>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-8 px-5 pb-10 sm:px-10 sm:pb-14 md:flex-row md:items-end md:justify-between md:px-14 md:pb-16">
        <p
          data-scene-line
          className="max-w-md text-[15px] leading-relaxed text-[#18161B]/75 opacity-0 sm:text-base"
        >
          One card account holds the money. Every agent spends its share, inside its own limits.
        </p>
        <h2
          data-scene-line
          className="font-light text-[#18161B] opacity-0 md:text-right"
          style={HEADLINE}
        >
          Every Agent Spends
        </h2>
      </div>
    </section>
  );
}
