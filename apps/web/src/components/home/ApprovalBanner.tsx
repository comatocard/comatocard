"use client";
import { Clock3 } from "lucide-react";
import Link from "next/link";
import { useApprovals } from "../../hooks/data";
import { cn } from "../../lib/utils";

/** "1 payment waits for you", with the way to it. Nothing at all when the queue is empty. */
export function ApprovalBanner({ vault, className }: { vault: string; className?: string }) {
  const approvals = useApprovals(vault);
  const waiting = approvals.data?.items.length ?? 0;
  if (waiting === 0) return null;
  return (
    <Link
      href="/approvals"
      className={cn(
        "flex items-center gap-3 rounded-[18px] border border-[#f3dfc4] bg-warn-soft px-4 py-3 transition-transform duration-150 active:scale-[.99]",
        className,
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-warn [&_svg]:size-4">
        <Clock3 />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">
          {waiting === 1 ? "1 payment waits for you" : `${waiting} payments wait for you`}
        </span>
        <span className="block truncate text-[12px] text-warn">Over your limit or flagged</span>
      </span>
      <span className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white">
        Review
      </span>
    </Link>
  );
}
