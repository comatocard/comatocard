"use client";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";

/** An example exchange: the three outcomes a payment can have. Illustrative, not live data. */
const LINES = [
  { from: "You", text: "pay for the weather API" },
  { from: "Comatocard", text: "done. 2 tUSD from Research agent's card." },
  { from: "You", text: "and the 40 tUSD dataset?" },
  { from: "Comatocard", text: "above your threshold. it's waiting for you." },
  { from: "You", text: "who is data.vendor.testnet?" },
  { from: "Comatocard", text: "the registry flagged it. nothing was paid." },
] as const;

/**
 * The conversation plays once as it scrolls into view: each message rises in, and the card's
 * replies type themselves out, so the three outcomes land one at a time.
 */
export function ChatDemo() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      const bubbles = gsap.utils.toArray<HTMLElement>("[data-bubble]");
      if (reduce) return;
      gsap.set(bubbles, { opacity: 0, y: 10 });
      const tl = gsap.timeline({ paused: true });
      for (const bubble of bubbles) {
        const text = bubble.querySelector<HTMLElement>("[data-text]");
        const full = text?.textContent ?? "";
        tl.to(bubble, { opacity: 1, y: 0, duration: 0.32, ease: EASE.out }, "+=0.25");
        if (text && bubble.dataset.bubble === "card") {
          const state = { n: 0 };
          tl.fromTo(
            state,
            { n: 0 },
            {
              n: full.length,
              duration: full.length * 0.022,
              ease: "none",
              onUpdate: () => {
                text.textContent = full.slice(0, Math.round(state.n));
              },
            },
            "<",
          );
        }
      }
      ScrollTrigger.create({ trigger: el, start: "top 70%", once: true, onEnter: () => tl.play() });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} aria-label="Example conversation" className="bg-bg px-5 py-24 lg:py-36">
      <ol className="mx-auto flex max-w-[720px] flex-col gap-6">
        {LINES.map((line) => {
          const card = line.from === "Comatocard";
          return (
            <li
              key={line.text}
              data-bubble={card ? "card" : "you"}
              className={cn(
                "flex max-w-[85%] flex-col gap-1.5",
                card ? "items-end self-end" : "items-start",
              )}
            >
              <span className="px-1 text-[12px] text-muted">{line.from}</span>
              <span
                data-text
                className={cn(
                  "rounded-[20px] px-5 py-3 text-[15px] lg:text-[17px]",
                  card ? "bg-[#111316] text-white" : "bg-[#e9e9e9] text-ink",
                )}
              >
                {line.text}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
