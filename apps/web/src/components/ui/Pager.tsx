"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SmoothHeight } from "../../lib/motion/SmoothHeight";
import { useStepSwap } from "../../lib/motion/useStepSwap";
import { clampPage, pageCount, pageLabel, pageSlice } from "../../lib/paging";
import { cn } from "../../lib/utils";

/** Previous, "2 of 5", next. Hidden when everything fits on one page. */
export function Pager({
  page,
  count,
  onPage,
  label,
  className,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
  /** What is being paged, for screen readers: "activity", "requests". */
  label: string;
  className?: string;
}) {
  if (count <= 1) return null;
  const arrow =
    "grid size-8 place-items-center rounded-full border border-line bg-white transition-[opacity,transform] duration-150 active:scale-[.94] disabled:opacity-35 [&_svg]:size-4";
  return (
    <nav aria-label={`${label} pages`} className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        className={arrow}
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        aria-label={`Previous ${label}`}
      >
        <ChevronLeft />
      </button>
      <span
        className="min-w-[44px] text-center text-[12.5px] font-semibold text-muted tabular-nums"
        aria-live="polite"
      >
        {pageLabel(page, count)}
      </span>
      <button
        type="button"
        className={arrow}
        onClick={() => onPage(page + 1)}
        disabled={page >= count - 1}
        aria-label={`Next ${label}`}
      >
        <ChevronRight />
      </button>
    </nav>
  );
}

/**
 * A list that pages instead of growing: `size` items at a time, the page sliding toward the
 * direction of travel through GSAP. The page stays inside the list when it shrinks, and goes back
 * to the first page when `resetKey` changes (another card, another vault).
 */
export function usePaged<T>(items: readonly T[] | undefined, size: number, resetKey?: unknown) {
  const all = items ?? [];
  const [page, setPage] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const current = clampPage(page, all.length, size);
  const swap = useStepSwap(panel, current);

  const reset = useRef(resetKey);
  useEffect(() => {
    if (reset.current === resetKey) return;
    reset.current = resetKey;
    setPage(0);
  }, [resetKey]);

  const go = (next: number) => {
    const target = clampPage(next, all.length, size);
    swap(target, () => setPage(target));
  };
  return {
    panel,
    page: current,
    count: pageCount(all.length, size),
    items: pageSlice(all, current, size),
    go,
  };
}

/**
 * The frame a paged list renders into: the slide never spills over its neighbours, and a short
 * last page shrinks the frame smoothly instead of pulling the content below it up in one jump.
 */
export function PagedPanel({
  panel,
  children,
  className,
}: {
  panel: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SmoothHeight>
      <div className="overflow-hidden">
        <div ref={panel} className={className}>
          {children}
        </div>
      </div>
    </SmoothHeight>
  );
}
