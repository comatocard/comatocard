"use client";
import type { Card } from "@comatocard/sdk";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardNumber, currentSpend, expiryLabel, KIND_LABEL } from "../../lib/cards";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { useStepSwap } from "../../lib/motion/useStepSwap";
import { CardArtwork } from "../card/CardArtwork";
import { SpendBar } from "../cards/SpendBar";
import { Skeleton } from "../ui";

/**
 * The vault's cards as a row that snaps one card at a time, the next one peeking in. Under it, on
 * phones, the card in view: its name and today's spend, swapping with a GSAP slide as the row
 * moves. Native scroll snap does the dragging, so a swipe feels like the system's own.
 */
export function CardCarousel({
  cards,
  loading,
  vault,
  decimals,
  symbol,
  now,
}: {
  cards: Card[] | undefined;
  loading: boolean;
  vault: string;
  decimals: number;
  symbol: string;
  now: number | null;
}) {
  const live = (cards ?? []).filter((c) => c.status !== "revoked").reverse();
  const row = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const swap = useStepSwap(info, shown);

  // The card in view is the one whose centre is nearest the row's centre.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const items = [...el.children] as HTMLElement[];
        const centre = el.scrollLeft + el.clientWidth / 2;
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        items.forEach((item, i) => {
          const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - centre);
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        });
        setActive(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (active !== shown) swap(active, () => setShown(active));
  }, [active, shown, swap]);

  // The card in view comes forward and its dot stretches; transforms only, through GSAP.
  const count = live.length;
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const duration = prefersReducedMotion() ? 0 : 0.3;
    // Re-run when cards come or go, so a new card starts in the right state.
    const items = [...el.children].slice(0, count);
    const tween = gsap.to(items, {
      scale: (i: number) => (i === active ? 1 : 0.97),
      opacity: (i: number) => (i === active ? 1 : 0.7),
      duration,
      ease: EASE.out,
    });
    const dotTween = gsap.to(dots.current.filter(Boolean), {
      scaleX: (i: number) => (i === active ? 1 : 1 / 3),
      backgroundColor: (i: number) => (i === active ? "#111316" : "#dedede"),
      duration,
      ease: EASE.out,
    });
    return () => {
      tween.kill();
      dotTween.kill();
    };
  }, [active, count]);

  if (loading) {
    return <Skeleton className="aspect-[1.586] w-[86%] max-w-[340px] rounded-[18px]" />;
  }
  if (live.length === 0) return null;
  const card = live[Math.min(shown, live.length - 1)];
  const spend = card && now ? currentSpend(card, now) : null;

  return (
    <section aria-label="Cards">
      <div
        ref={row}
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {live.map((c, i) => (
          <Link
            key={c.id}
            href={`/cards/${c.id}?vault=${encodeURIComponent(vault)}`}
            aria-label={`Open ${c.label}`}
            aria-current={i === active ? "true" : undefined}
            className="aspect-[1.586] w-[86%] max-w-[340px] shrink-0 snap-center overflow-hidden rounded-[18px] [box-shadow:0_24px_40px_-24px_rgba(0,0,0,.55)] lg:w-full"
          >
            <CardArtwork
              label={c.label}
              number={cardNumber(c.id)}
              expiry={expiryLabel(c.policy.expires_at)}
              kind={c.kind}
              frozen={c.status === "frozen"}
              detailsVisible={false}
            />
          </Link>
        ))}
      </div>
      {/* On desktop the Cards list beside the carousel carries this summary already. */}
      {card ? (
        <div className="mt-3 overflow-hidden lg:hidden">
          <div ref={info} className="rounded-[18px] bg-card px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="truncate text-[15px] font-semibold">{card.label}</span>
              <span className="shrink-0 text-[12px] font-medium text-muted capitalize">
                {card.status === "frozen" ? "Frozen" : KIND_LABEL[card.kind]}
              </span>
            </div>
            {spend ? (
              <SpendBar
                label="Today"
                spent={spend.today}
                limit={card.policy.daily_limit}
                decimals={decimals}
                symbol={symbol}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {live.length > 1 ? (
        <div className="mt-3 flex justify-center gap-0.5" aria-hidden="true">
          {live.map((c, i) => (
            <span
              key={c.id}
              ref={(node) => {
                dots.current[i] = node;
              }}
              className="h-1.5 w-[18px] scale-x-[.333] rounded-full bg-line-2"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
