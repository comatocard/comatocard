"use client";
import { useLayoutEffect, useRef } from "react";
import { cardNumber } from "../../lib/cards";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { CardArtwork } from "../card/CardArtwork";

/**
 * The connect screen's card: it settles in once, tilted, then floats. Seen once per visit, so it
 * can take its time; the float is slow and small enough to stay in the background.
 */
export function FloatingCard() {
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const tl = gsap.timeline();
    tl.fromTo(
      card.current,
      { autoAlpha: 0, y: reduce ? 0 : 28, rotation: reduce ? -6 : -12, scale: reduce ? 1 : 0.94 },
      { autoAlpha: 1, y: 0, rotation: -6, scale: 1, duration: 0.7, ease: EASE.out },
    );
    if (!reduce) {
      tl.to(
        wrap.current,
        { y: -10, rotation: 1, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1 },
        0.4,
      );
    }
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={wrap}
      className="mx-auto w-full max-w-[320px] will-change-transform"
      aria-hidden="true"
    >
      <div
        ref={card}
        className="invisible aspect-[1.586] overflow-hidden rounded-[16px] opacity-0 ring-1 ring-white/15 [box-shadow:0_40px_70px_-30px_rgba(0,0,0,.9)]"
      >
        <CardArtwork
          label="Your agent"
          number={cardNumber(0)}
          expiry="None"
          kind="agent"
          frozen={false}
          detailsVisible={false}
        />
      </div>
    </div>
  );
}
