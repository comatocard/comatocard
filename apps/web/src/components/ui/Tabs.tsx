"use client";
import { useLayoutEffect, useRef } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** A count beside the label, such as the number of payments. */
  badge?: number;
}

/**
 * Two or three tabs in a pill. The white thumb glides under the chosen tab with GSAP: one element
 * moving, not two backgrounds swapping, so the eye follows it.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const thumb = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );

  useLayoutEffect(() => {
    const el = thumb.current;
    if (!el) return;
    const instant = first.current || prefersReducedMotion();
    first.current = false;
    const tween = gsap.to(el, {
      xPercent: index * 100,
      duration: instant ? 0 : DURATION.enter,
      ease: EASE.inOut,
    });
    return () => {
      tween.kill();
    };
  }, [index]);

  return (
    <div role="tablist" aria-label={label} className="relative flex rounded-full bg-pill p-1">
      <span
        ref={thumb}
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-full bg-white shadow-[0_6px_14px_-8px_rgba(17,19,22,.35)]"
        style={{ width: `calc((100% - 8px) / ${items.length})` }}
      />
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition-colors duration-200",
              selected ? "text-ink" : "text-muted",
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="rounded-full bg-ink/10 px-1.5 text-[11px] tabular-nums">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
