"use client";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";
import { LINKS, SECTION } from "./links";

const FAQS = [
  { q: "Who holds the money?", a: "You. Only your wallet controls the card account." },
  {
    q: "Can an agent raise its own limit?",
    a: "No. An agent can only pay. Only you can change its limits.",
  },
  {
    q: "What if an agent gets tricked?",
    a: "It still can't pay past its limits or to blocked accounts, and big payments wait for you. Freeze or cancel the card any time.",
  },
  {
    q: "Does it cost anything to start?",
    a: "Opening a card account takes 0.5 NEAR, which also covers your cards' payment fees. After that, your changes cost you nothing.",
  },
  { q: "Can I use real money?", a: "Not yet. It runs on a test network for now." },
] as const;

const FOOTER = [
  {
    heading: "Product",
    items: [
      { label: "How it works", href: `#${SECTION.steps}` },
      { label: "Why Comatocard", href: `#${SECTION.safety}` },
      { label: "Merchants", href: `#${SECTION.merchants}` },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "GitHub", href: LINKS.repo },
      { label: "Docs", href: LINKS.docs },
      { label: "Compliance", href: LINKS.compliance },
      { label: "NEAR", href: LINKS.near },
    ],
  },
] as const;

/** One question; its answer opens and closes with a GSAP height tween. */
function Question({
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
  const chevron = useRef<SVGSVGElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const instant = first.current || prefersReducedMotion();
    first.current = false;
    const tl = gsap.timeline({
      defaults: { duration: instant ? 0 : DURATION.height, ease: EASE.inOut },
    });
    tl.to(panel.current, { height: open ? "auto" : 0, autoAlpha: open ? 1 : 0 }, 0);
    tl.to(chevron.current, { rotation: open ? 180 : 0 }, 0);
    return () => {
      tl.kill();
    };
  }, [open]);

  return (
    <div
      className={cn(
        "rounded-[10px] border bg-white px-5 py-[18px] transition-[border-color,box-shadow] duration-200",
        open
          ? "border-[#eaeaea] shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
          : "border-[#f0f0f0] shadow-[0_2px_8px_rgba(0,0,0,0.02)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left text-[0.95rem] text-[#18161B]"
      >
        {q}
        <ChevronDown ref={chevron} size={20} className="shrink-0" />
      </button>
      <div ref={panel} className="h-0 overflow-hidden opacity-0">
        <p className="mt-3 text-[0.9rem] leading-[1.6] text-[#666]">{a}</p>
      </div>
    </div>
  );
}

/** The closing call to action beside the FAQ, then the footer. */
export function Closing() {
  const [open, setOpen] = useState(0);
  return (
    <div className="bg-white text-[#18161B]">
      <div className="mx-auto w-full max-w-[1100px] px-5 py-[60px] md:py-20">
        <div className="grid grid-cols-1 items-stretch gap-[60px] md:grid-cols-[1.6fr_1fr] md:gap-[30px]">
          <div
            data-scroll
            className="landing-gradient flex flex-col items-center justify-center rounded-[24px] px-6 py-14 text-center text-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:px-10 sm:py-20"
          >
            <h2
              className="mb-[15px] leading-[1.1] font-normal"
              style={{ fontSize: "clamp(2.25rem, 11vw, 3.5rem)", letterSpacing: "-0.03em" }}
            >
              Hand over the card.
              <br />
              Keep the keys.
            </h2>
            <p className="mb-[30px] text-[0.95rem] opacity-85">
              Your agents spend. You set the rules.
            </p>
            <Link
              href={LINKS.app}
              className="rounded-xl bg-[#18161B] px-8 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.3)] transition-transform duration-200 active:scale-[.97]"
            >
              Open the app
            </Link>
          </div>
          <div id={SECTION.faq} className="flex scroll-mt-24 flex-col justify-center gap-3">
            {FAQS.map((item, i) => (
              <Question
                key={item.q}
                q={item.q}
                a={item.a}
                open={open === i}
                onToggle={() => setOpen(open === i ? -1 : i)}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="rounded-t-[32px] bg-[#fafafa] pt-[60px] pb-5 md:rounded-t-[56px] md:pt-20">
        <div className="mx-auto w-full max-w-[1100px] px-5">
          <div className="mb-[50px] grid grid-cols-1 gap-10 min-[480px]:grid-cols-2 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <Image
                src="/comatocard-icon.svg"
                alt="Comatocard"
                width={24}
                height={24}
                className="mb-[15px] size-6"
              />
              <p className="max-w-[240px] text-[0.85rem] leading-[1.6] text-[#888]">
                Payment cards for AI agents, on NEAR.
              </p>
            </div>
            {FOOTER.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <h3 className="mb-5 text-[0.95rem] font-semibold">{column.heading}</h3>
                <ul>
                  {column.items.map((item) => (
                    <li key={item.label} className="mb-3">
                      <a
                        href={item.href}
                        className="text-[0.85rem] text-[#888] transition-colors duration-200 hover:text-[#18161B]"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="flex flex-col items-center gap-[15px] border-t border-[#f0f0f0] pt-[25px] pb-[10px] text-[0.85rem] text-[#888] min-[480px]:flex-row min-[480px]:justify-between">
            <span>Comatocard, 2026 · MIT · Built at NEAR Hackathon</span>
            <span>Test network only. No real money.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
