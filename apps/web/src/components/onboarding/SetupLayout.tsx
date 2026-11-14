"use client";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { DONE_STEP } from "../../lib/setup-flow";
import { cn } from "../../lib/utils";
import { SetupProgress, SetupStepList } from "./SetupProgress";

/** The wordmark for the dark panel and the connect screen. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex items-center gap-2.5 text-[18px] font-bold tracking-[-.02em]", className)}
    >
      <Image src="/comatocard-icon.svg" alt="" width={26} height={26} className="rounded-[8px]" />
      Comatocard
    </span>
  );
}

/**
 * The backdrop of the dark panel and the connect screen: an embossed guilloche, the same rings
 * the card face carries, lit from the top left. It turns very slowly so the panel is never a
 * still picture; reduced motion keeps it still. The gradient keeps the headline readable.
 */
export function PanelGlow() {
  const art = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = art.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.fromTo(
      el,
      { scale: 1.08, rotation: -1.5 },
      { scale: 1.16, rotation: 1.5, duration: 24, ease: "sine.inOut", yoyo: true, repeat: -1 },
    );
    return () => {
      tween.kill();
    };
  }, []);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span ref={art} className="absolute inset-0 will-change-transform">
        <Image
          src="/onboarding/guilloche.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[50%_35%]"
        />
      </span>
      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,12,13,.15)_0%,rgba(11,12,13,.2)_45%,rgba(11,12,13,.82)_72%,#0b0c0d_92%)]" />
    </span>
  );
}

/**
 * Setup's frame. On a phone: back, progress and the stage card above the step. On a desktop: a
 * dark panel with the stage card and the step list on the left, the step on the right.
 */
export function SetupLayout({
  step,
  done,
  stage,
  panel,
  onBack,
  children,
}: {
  step: number;
  /** What the chain has done, per step, for the checks in the step list. */
  done: readonly boolean[];
  stage: ReactNode;
  panel: RefObject<HTMLDivElement | null>;
  onBack: (() => void) | null;
  children: ReactNode;
}) {
  const finished = step >= DONE_STEP;
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(440px,42%)_1fr]">
      <aside className="relative px-6 pt-[max(16px,env(safe-area-inset-top))] lg:flex lg:flex-col lg:justify-between lg:overflow-hidden lg:bg-[#0b0c0d] lg:px-14 lg:py-10 lg:text-white">
        <span className="hidden lg:contents">
          <PanelGlow />
        </span>
        <Wordmark className="relative hidden lg:flex" />
        <div className="flex items-center gap-3.5 lg:hidden">
          <button
            type="button"
            aria-label="Back"
            onClick={onBack ?? undefined}
            disabled={!onBack}
            className="grid size-[38px] place-items-center rounded-full border border-line bg-card transition-[opacity,transform] duration-150 active:scale-[.96] disabled:opacity-40"
          >
            <ChevronLeft className="size-[18px]" />
          </button>
          <SetupProgress step={step} />
          <span className="w-9 text-right text-[13px] font-semibold text-muted tabular-nums">
            {finished ? "Done" : `${step + 1}/3`}
          </span>
        </div>
        <div className="relative py-8 lg:py-0">{stage}</div>
        <div className="relative hidden lg:block">
          <SetupStepList step={step} done={done} />
        </div>
      </aside>
      <section className="flex flex-1 flex-col px-6 pb-[max(20px,env(safe-area-inset-bottom))] lg:items-center lg:justify-center lg:px-16 lg:py-12">
        <div className="flex w-full max-w-[420px] flex-1 flex-col lg:flex-none">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-6 hidden items-center gap-1 self-start text-[14px] font-semibold text-muted transition-colors hover:text-ink lg:flex"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          ) : null}
          <div ref={panel} className="flex flex-1 flex-col">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
