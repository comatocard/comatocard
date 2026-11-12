"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../lib/motion/gsap";
import { InfoTip } from "../ui";
import { GUTTER, HEADLINE, INK, PAGE_BG, SECTION } from "./links";

const SUB = "mt-[30px] text-[15px] leading-relaxed text-[#18161B]/60 sm:text-base";

/**
 * The account refilling before it runs dry. The clip has its background removed, so it needs
 * alpha: VP9 WebM carries it in Chrome and Firefox, HEVC in Safari and every iOS browser. The
 * source is picked after mount by engine; reduced motion keeps the still poster.
 */
export function ToppedUp() {
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const webkit = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    setSrc(webkit ? "/landing/topup-card.mov" : "/landing/topup-card.webm");
  }, []);

  useEffect(() => {
    const el = video.current;
    if (!el || !src) return;
    el.muted = true;
    void el.play().catch(() => undefined);
  }, [src]);

  return (
    <section className={`${GUTTER} ${PAGE_BG} relative overflow-hidden py-16 sm:py-24`}>
      <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1fr_minmax(0,420px)] md:gap-16">
        <div className="max-w-xl">
          <h2 data-scroll className={`font-light ${INK}`} style={HEADLINE}>
            Topped up
            <br />
            before it runs dry.
          </h2>
          <p data-scroll className={`${SUB} flex items-center gap-1.5`}>
            Refilled through NEAR Intents.
            <InfoTip label="Top-ups">
              When the cards may spend more than the account holds, a swap is planned with a 1Click
              quote. It is a dry run by default; nothing moves until you sign.
            </InfoTip>
          </p>
        </div>
        <div data-scroll className="mx-auto w-full max-w-[420px]">
          {src ? (
            <video
              ref={video}
              key={src}
              src={src}
              poster="/landing/topup-card-poster.png"
              autoPlay
              muted
              loop
              playsInline
              tabIndex={-1}
              className="aspect-[720/1152] w-full"
            />
          ) : (
            <Image
              src="/landing/topup-card-poster.png"
              alt=""
              width={720}
              height={1152}
              className="aspect-[720/1152] w-full"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** HTTP 402: the merchant asks, the card pays, the resource unlocks. */
export function AskPay() {
  return (
    <section
      id={SECTION.merchants}
      className={`${PAGE_BG} relative scroll-mt-24 overflow-hidden py-16 sm:py-24 md:min-h-[100svh] md:pt-[120px] md:pb-0`}
    >
      <div className={GUTTER}>
        <div className="relative z-[1] max-w-3xl">
          <h2 data-scroll className={`font-light ${INK}`} style={HEADLINE}>
            Ask.
            <br />
            Pay.
          </h2>
          <p data-scroll className={SUB}>
            Your agent asks. The card pays. The API unlocks.
          </p>
          <pre
            data-scroll
            className="mt-8 max-w-md rounded-[16px] bg-[#18161B] p-5 font-mono text-[11.5px] leading-[1.8] break-all whitespace-pre-wrap text-white/75 sm:text-[12px] sm:break-normal"
          >
            <span className="text-[#4ade80]">GET</span> /api/shop/report{"\n"}
            <span className="text-[#fbbf24]">402</span>
            {' { amount: "1000000", reference: "shop-8f2c…" }\n'}
            pay(merchant, amount, reference) <span className="text-white/40">→ settled</span>
            {"\n"}
            <span className="text-[#4ade80]">200</span>
            {" { gas_price, block_height, receipt }"}
          </pre>
        </div>
      </div>
      <Image
        src="/landing/buy-anything.png"
        alt="A phone paying at a terminal"
        width={1000}
        height={701}
        sizes="(min-width: 768px) 74vw, 100vw"
        className="mt-12 w-full px-5 sm:px-10 md:absolute md:right-0 md:bottom-0 md:mt-0 md:w-[74%] md:px-0"
      />
    </section>
  );
}

/** The flag ring, full width, with the copy centred on it: the limits hold at any hour. */
export function AroundTheClock() {
  return (
    <section className="relative my-16 flex items-center justify-center overflow-hidden rounded-[40px] md:my-28 md:rounded-[72px]">
      <video
        ref={(el) => {
          if (el) el.muted = true;
        }}
        className="w-full object-contain"
        poster="/landing/flags-poster.jpg"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
      >
        <source src="/landing/flags.mp4" type="video/mp4" />
      </video>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <h2
          data-scroll
          className={`font-light ${INK}`}
          style={{
            fontSize: "clamp(1.9rem, 5.2vw, 3.75rem)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          Agents work around the clock.
          <br />
          So do their cards.
        </h2>
      </div>
    </section>
  );
}

const PILLARS = [
  {
    title: "You hold it",
    blurb: "Not us. Only your wallet controls the account.",
    src: "/landing/profile.png",
  },
  { title: "Limits it can't change", blurb: "A card key can only pay", src: "/landing/lock.png" },
  {
    title: "Every payment on record",
    blurb: "Each attempt, with its reason, on chain",
    src: "/landing/network.png",
  },
  { title: "Checks the payee", blurb: "Blocked accounts are refused", src: "/landing/shield.png" },
] as const;

/** Four guarantees, each over its icon tile. */
export function Safety() {
  return (
    <section id={SECTION.safety} className={`${GUTTER} ${PAGE_BG} scroll-mt-24 py-16 sm:py-24`}>
      <p data-scroll className="text-[11px] tracking-[0.2em] text-[#18161B]/45 uppercase">
        Safety
      </p>
      <h2 data-scroll className={`mt-5 max-w-3xl font-light ${INK}`} style={HEADLINE}>
        The contract decides, not the prompt
      </h2>
      <div className="mt-12 grid gap-5 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((pillar, i) => (
          <div key={pillar.title} data-scroll>
            <div className="border-t border-[#18161B]/15 pt-5">
              <h3 className="text-[15px] font-semibold text-[#18161B]">{pillar.title}</h3>
              <p className="mt-1.5 text-[15px] leading-snug text-[#18161B]/45">{pillar.blurb}</p>
            </div>
            <div className="relative mt-6 aspect-[384/350] rounded-2xl bg-white">
              <Image
                data-float
                src={pillar.src}
                alt=""
                width={360}
                height={360}
                className="absolute inset-0 m-auto w-[39%] object-contain"
              />
              <span className="absolute bottom-5 left-5 font-mono text-[12px] text-[#18161B]/35">{`0${i + 1}`}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
