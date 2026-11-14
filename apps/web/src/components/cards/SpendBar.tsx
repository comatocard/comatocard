"use client";
import { useRef } from "react";
import { DURATION, EASE } from "../../lib/motion/gsap";
import { useTweenTo } from "../../lib/motion/useShowHide";
import { displayUnits, ratio } from "../../lib/units";

const FILL_TIMING = { duration: DURATION.height, ease: EASE.inOut };

/** Spent against a limit, as a thin bar with both figures. Full turns the bar red. */
export function SpendBar({
  label,
  spent,
  limit,
  decimals,
  symbol,
}: {
  label: string;
  spent: string;
  limit: string;
  decimals: number;
  symbol: string;
}) {
  const r = ratio(spent, limit);
  const fill = useRef<HTMLDivElement>(null);
  useTweenTo(fill, { width: `${Math.max(r * 100, r > 0 ? 3 : 0)}%` }, FILL_TIMING);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-muted">{label}</span>
        <span className="tabular-nums text-ink-2">
          <b className="font-semibold">{displayUnits(spent, decimals)}</b>
          <span className="text-muted">
            {" "}
            / {displayUnits(limit, decimals)} {symbol}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div ref={fill} className={`h-full w-0 rounded-full ${r >= 1 ? "bg-neg" : "bg-ink"}`} />
      </div>
    </div>
  );
}
