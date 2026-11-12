"use client";
import { Check, Plus, ShieldCheck, Zap } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { cardNumber } from "../../lib/cards";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";
import { CardArtwork } from "../card/CardArtwork";

/** What the stage shows: the card builds up as the owner moves through setup. */
export type Stage = "empty" | "account" | "funded" | "card" | "done";

export interface StageCardProps {
  stage: Stage;
  /** The card account name, before and after it exists. */
  account: string;
  /** The card's name once the owner types one. */
  label: string;
  /** The latest top-up, in token units, for the chip on the funded stage. */
  amount: string;
  symbol: string;
  perTx: string;
  tone: "light" | "dark";
}

function chipFor(p: StageCardProps): { icon: ReactNode; text: string; positive: boolean } | null {
  switch (p.stage) {
    case "empty":
      return { icon: <Zap />, text: "0.5 NEAR", positive: false };
    case "funded":
      return { icon: null, text: `+${p.amount} ${p.symbol}`.trim(), positive: true };
    case "card":
      return { icon: <ShieldCheck />, text: `${p.perTx} / payment`, positive: false };
    default:
      return null;
  }
}

function chipTone(positive: boolean, dark: boolean): string {
  if (positive) return "bg-pos text-white";
  return dark
    ? "border border-white/15 bg-[#1c1d1f] text-white"
    : "border border-white bg-card text-ink";
}

/**
 * The card that assembles itself during setup: an empty outline, then the card face with the
 * account name, a funds chip, the card's own name and limit, and a check once it is live. One
 * element throughout, so the eye follows a single object instead of a sequence of pictures.
 */
export function StageCard(props: StageCardProps) {
  const { stage, account, label, tone } = props;
  const root = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLDivElement>(null);
  const check = useRef<HTMLSpanElement>(null);
  const hasFace = stage !== "empty";
  const chipData = chipFor(props);
  const chipKey = chipData?.text ?? "none";

  // Idle float: slow, small and decorative. Off when the system asks for less motion.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.to(el, {
      y: -6,
      rotation: 0.6,
      duration: 2.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    return () => {
      tween.kill();
    };
  }, []);

  // Outline to face: one crossfade with a small scale, the deliberate 450 ms build.
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const tl = gsap.timeline({ defaults: { duration: DURATION.build, ease: EASE.inOut } });
    tl.to(outline.current, { autoAlpha: hasFace ? 0 : 1, scale: hasFace && !reduce ? 0.98 : 1 }, 0);
    tl.fromTo(
      face.current,
      { scale: hasFace && !reduce ? 0.96 : 1 },
      { autoAlpha: hasFace ? 1 : 0, scale: 1 },
      0,
    );
    return () => {
      tl.kill();
    };
  }, [hasFace]);

  // The chip pops in each time it says something new.
  useLayoutEffect(() => {
    if (chipKey === "none" || !chip.current) return;
    const reduce = prefersReducedMotion();
    const tween = gsap.fromTo(
      chip.current,
      { autoAlpha: 0, scale: reduce ? 1 : 0.9, y: reduce ? 0 : 6 },
      { autoAlpha: 1, scale: 1, y: 0, duration: DURATION.enter, ease: EASE.out, delay: 0.12 },
    );
    return () => {
      tween.kill();
    };
  }, [chipKey]);

  useLayoutEffect(() => {
    if (stage !== "done" || !check.current) return;
    const tween = gsap.fromTo(
      check.current,
      { autoAlpha: 0, scale: prefersReducedMotion() ? 1 : 0.9 },
      { autoAlpha: 1, scale: 1, duration: 0.24, ease: EASE.out, delay: 0.2 },
    );
    return () => {
      tween.kill();
    };
  }, [stage]);

  const dark = tone === "dark";
  return (
    <div className="relative mx-auto w-full max-w-[320px]" aria-hidden="true">
      <div ref={root} className="relative aspect-[1.586] w-full will-change-transform">
        <div
          ref={outline}
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-[16px] border-[1.5px] border-dashed",
            dark ? "border-white/25 bg-white/[.04]" : "border-line-2 bg-white/50",
          )}
        >
          <span
            className={cn(
              "grid size-11 place-items-center rounded-full [&_svg]:size-5",
              dark ? "bg-white/10 text-white" : "border border-line bg-card text-ink",
            )}
          >
            <Plus />
          </span>
          <span className={cn("text-[14px] font-semibold", dark ? "text-white/60" : "text-muted")}>
            {account || "your-name"}
          </span>
        </div>
        <div
          ref={face}
          className={cn(
            "invisible absolute inset-0 overflow-hidden rounded-[16px] opacity-0 [box-shadow:0_30px_50px_-24px_rgba(0,0,0,.55)]",
            dark && "ring-1 ring-white/15",
          )}
        >
          {/* A vault numbers its cards from 0, so the first card it issues reads 0000. */}
          <CardArtwork
            label={(stage === "card" || stage === "done" ? label : account) || "Your card"}
            number={cardNumber(0)}
            expiry="None"
            kind="agent"
            frozen={false}
            detailsVisible={false}
          />
        </div>
        {chipData ? (
          <div
            key={chipKey}
            ref={chip}
            className={cn(
              "absolute flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold opacity-0 [box-shadow:0_10px_24px_-12px_rgba(17,19,22,.35)] [&_svg]:size-[15px]",
              stage === "empty" ? "-top-3 -right-2" : "-right-2 -bottom-3",
              chipTone(chipData.positive, dark),
            )}
          >
            {chipData.icon}
            {chipData.text}
          </div>
        ) : null}
        {stage === "done" ? (
          <span
            ref={check}
            className={cn(
              "absolute -top-3 -right-3 grid size-11 place-items-center rounded-full border-[3px] bg-pos text-white opacity-0 [box-shadow:0_10px_22px_-8px_rgba(22,163,74,.55)] [&_svg]:size-[22px]",
              dark ? "border-[#0b0c0d]" : "border-white",
            )}
          >
            <Check strokeWidth={3} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
