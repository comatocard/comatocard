"use client";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";
import { GUTTER, PAGE_BG } from "./links";

/** An example exchange showing the three ways a payment can end. Illustrative, not live data. */
const TRANSCRIPT = [
  { speaker: "you", text: "pay for the weather API" },
  { speaker: "card", text: "done. 2 tUSD from Research agent's card." },
  { speaker: "you", text: "and the 40 tUSD dataset?" },
  { speaker: "card", text: "above your threshold. it's waiting for you." },
  { speaker: "you", text: "who is data.vendor.testnet?" },
  { speaker: "card", text: "the registry flagged it. nothing was paid." },
] as const;

/**
 * Types the exchange out on a GSAP timeline the first time it scrolls into view, with a pause
 * before each card reply so it reads as a conversation. It plays once.
 */
function useTypedTranscript(root: React.RefObject<HTMLElement | null>) {
  const [typed, setTyped] = useState<string[]>(() => TRANSCRIPT.map(() => ""));
  const [typing, setTyping] = useState(-1);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setTyped(TRANSCRIPT.map((e) => e.text));
      return;
    }
    const tl = gsap.timeline({ paused: true });
    TRANSCRIPT.forEach((entry, i) => {
      if (entry.speaker === "card") {
        tl.call(() => setThinking(true));
        tl.to({}, { duration: 0.55 });
        tl.call(() => setThinking(false));
      }
      const counter = { n: 0 };
      tl.call(() => setTyping(i));
      tl.to(counter, {
        n: entry.text.length,
        duration: Math.min(1.5, 0.22 + entry.text.length * 0.016),
        ease: "none",
        onUpdate: () => {
          const n = Math.round(counter.n);
          setTyped((prev) => {
            if (prev[i]?.length === n) return prev;
            const next = [...prev];
            next[i] = entry.text.slice(0, n);
            return next;
          });
        },
      });
      tl.to({}, { duration: 0.28 });
    });
    tl.call(() => setTyping(-1));
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 65%",
      once: true,
      onEnter: () => tl.play(),
    });
    return () => {
      trigger.kill();
      tl.kill();
    };
  }, [root]);

  return { typed, typing, thinking };
}

export function ChatDemo() {
  const root = useRef<HTMLElement>(null);
  const { typed, typing, thinking } = useTypedTranscript(root);
  return (
    <section
      ref={root}
      aria-label="Example conversation"
      className={`${GUTTER} ${PAGE_BG} flex min-h-[100svh] items-center py-24`}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-col gap-4 sm:gap-6">
          {TRANSCRIPT.map((entry, i) => {
            const you = entry.speaker === "you";
            const shown = typed[i] ?? "";
            const started = shown.length > 0 || i === typing;
            return (
              <div
                key={entry.text}
                className={cn("flex flex-col", you ? "items-start" : "items-end")}
              >
                <span
                  className={cn(
                    "mb-2 px-3 text-xs text-[#18161B]/40 transition-opacity duration-300 sm:text-sm",
                    started ? "opacity-100" : "opacity-0",
                  )}
                >
                  {you ? "You:" : "Comatocard:"}
                </span>
                {/* Laid out from the start and only faded in, so the section never grows while it types. */}
                <div
                  className={cn(
                    "max-w-full rounded-[1.75rem] px-6 py-3 transition-opacity duration-300 sm:rounded-full sm:px-8 sm:py-4",
                    started ? "opacity-100" : "opacity-0",
                    you ? "bg-[#18161B]/[0.06] text-[#18161B]" : "bg-[#18161B] text-[#F4F0ED]",
                  )}
                  style={{
                    fontSize: "clamp(1.05rem, 2.4vw, 1.75rem)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.02em",
                  }}
                >
                  <span className="font-light">{shown || entry.text}</span>
                  {i === typing ? (
                    <span className="ml-1 inline-block h-[0.7em] w-[0.055em] animate-pulse bg-current align-middle" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-10 flex h-3 items-center justify-end gap-1.5 pr-6" aria-hidden="true">
          {thinking
            ? [0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="size-2 animate-pulse rounded-full bg-[#18161B]/40"
                  style={{ animationDelay: `${d * 0.15}s` }}
                />
              ))
            : null}
        </div>
      </div>
    </section>
  );
}
