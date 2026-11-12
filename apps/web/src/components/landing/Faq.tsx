"use client";
import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";
import { LINKS } from "./links";

const QUESTIONS = [
  { q: "Who holds the money?", a: "You. Only your wallet controls the card account." },
  {
    q: "Can an agent raise its own limit?",
    a: "No. A card key can only call pay. Limits change from your wallet alone.",
  },
  {
    q: "What if an agent gets tricked?",
    a: "It still can't pay past its limits or to blocked accounts, and big payments wait for you. Freeze or revoke the card any time.",
  },
  {
    q: "Do I need NEAR for gas?",
    a: "Opening the card account takes 0.5 NEAR, which also covers card payment gas. Your other actions go through the relayer at no cost to you.",
  },
  { q: "Is it live on mainnet?", a: "No. Testnet only, no real funds." },
] as const;

/** One question; its answer opens with a GSAP height tween instead of jumping. */
function Item({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const icon = useRef<SVGSVGElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const instant = first.current || prefersReducedMotion();
    first.current = false;
    const tl = gsap.timeline({
      defaults: { duration: instant ? 0 : DURATION.height, ease: EASE.inOut },
    });
    tl.to(el, { height: open ? "auto" : 0, autoAlpha: open ? 1 : 0 }, 0);
    tl.to(icon.current, { rotation: open ? 45 : 0 }, 0);
    return () => {
      tl.kill();
    };
  }, [open]);

  return (
    <li className="rounded-[18px] border border-line bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold"
      >
        {q}
        <Plus ref={icon} className="size-4 shrink-0 text-muted" />
      </button>
      <div ref={panel} className="h-0 overflow-hidden opacity-0">
        <p className="px-5 pb-4 text-[14px] text-muted">{a}</p>
      </div>
    </li>
  );
}

/** The closing pitch with its call to action, and the questions people ask first. */
export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="bg-white px-5 py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1180px] gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div
          data-scroll
          className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-[32px] p-8 text-center text-white"
        >
          <Image
            src="/onboarding/glow.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 640px, 100vw"
            className="object-cover"
          />
          <span className="absolute inset-0 bg-black/35" />
          <div className="relative">
            <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-.03em] lg:text-[46px]">
              Hand over the card.
              <br />
              Keep the keys.
            </h2>
            <p className="mt-3 text-[15px] text-white/75">
              Your agents spend. The contract decides.
            </p>
            <Link
              href={LINKS.app}
              className="mt-6 inline-block rounded-full bg-[#111316] px-6 py-3 text-[15px] font-semibold transition-transform duration-150 active:scale-[.97]"
            >
              Open the app
            </Link>
          </div>
        </div>
        <ul className={cn("space-y-2.5")} aria-label="Questions">
          {QUESTIONS.map((item, i) => (
            <Item
              key={item.q}
              q={item.q}
              a={item.a}
              open={open === i}
              onToggle={() => setOpen(open === i ? -1 : i)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
