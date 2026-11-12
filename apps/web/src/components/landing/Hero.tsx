"use client";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { Wordmark } from "../onboarding/SetupLayout";
import { LINKS, SECTIONS } from "./links";

/** The first screen: the photo, the promise, and the way into the app. */
export function Hero() {
  const root = useRef<HTMLElement>(null);

  // Seen once per visit, so it may take a little longer: the headline rises line by line.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-hero]",
        { opacity: 0, y: reduce ? 0 : 28 },
        { opacity: 1, y: 0, duration: 0.8, ease: EASE.out, stagger: 0.09, delay: 0.1 },
      );
      gsap.fromTo(
        "[data-hero-photo]",
        { scale: reduce ? 1 : 1.06 },
        { scale: 1, duration: 1.6, ease: EASE.out },
      );
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <header ref={root} className="relative flex min-h-[100svh] flex-col overflow-hidden text-white">
      <div data-hero-photo className="absolute inset-0">
        <Image
          src="/landing/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_40%]"
        />
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.35)_0%,rgba(0,0,0,0)_30%,rgba(0,0,0,.15)_60%,rgba(0,0,0,.65)_100%)]" />
      </div>

      <nav className="relative mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 pt-5 lg:px-10 lg:pt-6">
        <Wordmark className="text-white" />
        <ul className="hidden items-center gap-1 rounded-full border border-white/15 bg-black/25 p-1 backdrop-blur-md md:flex">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-full px-4 py-2 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {s.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={LINKS.docs}
              className="block rounded-full px-4 py-2 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Docs
            </a>
          </li>
        </ul>
        <Link
          href={LINKS.app}
          className="rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-ink transition-transform duration-150 active:scale-[.97]"
        >
          Open the app
        </Link>
      </nav>

      <div className="relative mx-auto mt-auto w-full max-w-[1280px] px-5 pb-10 lg:px-10 lg:pb-14">
        <p data-hero className="mb-4 flex flex-wrap items-center gap-2 text-[12px] font-semibold">
          <span className="rounded-full bg-[#4ade80] px-2.5 py-1 text-[#0b0c0d]">
            Live on testnet
          </span>
          <span className="rounded-full border border-white/25 bg-black/25 px-2.5 py-1 backdrop-blur-md">
            Built at NEAR Hackathon
          </span>
        </p>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h1
            data-hero
            className="max-w-[820px] text-[44px] font-semibold leading-[0.98] tracking-[-.04em] sm:text-[64px] lg:text-[88px]"
          >
            Give your agents a card, not your wallet.
          </h1>
          <div data-hero className="space-y-4 lg:max-w-[300px] lg:pb-3">
            <p className="text-[16px] text-white/80">
              Cards for AI agents. Limits enforced on NEAR.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href={LINKS.app}
                className="rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-ink transition-transform duration-150 active:scale-[.97]"
              >
                Open the app
              </Link>
              <a
                href="#story"
                className="flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-5 py-3 text-[15px] font-semibold backdrop-blur-md transition-transform duration-150 active:scale-[.97]"
              >
                <Play className="size-4 fill-current" />
                See it work
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
