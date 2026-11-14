"use client";
import { Check, Clock3 } from "lucide-react";
import Link from "next/link";
import { useApprovals, useCards, useToken } from "../../hooks/data";
import { displayUnits } from "../../lib/units";
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

/** How many waiting requests the desktop panel lists before it points to the full queue. */
const PANEL_ROWS = 3;

/**
 * The desktop twin of the banner: a panel beside the balance that lists what waits, with the
 * amount asked and the card's own limit, or says that nothing does. It always renders, so the
 * two panels of the row stay the same height.
 */
export function ApprovalPanel({ vault, className }: { vault: string; className?: string }) {
  const approvals = useApprovals(vault);
  const cards = useCards(vault);
  const token = useToken();
  const items = approvals.data?.items ?? [];
  const decimals = token.data?.decimals;
  const symbol = token.data?.symbol ?? "";
  const amount = (raw: string) => (decimals === undefined ? "…" : displayUnits(raw, decimals));

  if (items.length === 0) {
    return (
      <section
        aria-label="Approvals"
        className={cn(
          "flex flex-col items-start justify-center gap-2 rounded-card border border-white bg-card px-6 py-6",
          className,
        )}
      >
        <span className="grid size-9 place-items-center rounded-full bg-[#e8f5ec] text-pos">
          <Check size={17} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h2 className="text-[16px] font-semibold">Nothing waits for you</h2>
        <p className="text-[13px] text-muted">
          Payments above a card&apos;s threshold will ask here first.
        </p>
      </section>
    );
  }

  const total = items.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  return (
    <section
      aria-label="Approvals"
      className={cn(
        "flex flex-col rounded-card border border-[#f0ddbd] bg-warn-soft px-6 py-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold">
          {items.length === 1 ? "1 payment waits for you" : `${items.length} payments wait for you`}
        </h2>
        <span className="shrink-0 text-[13px] font-semibold text-warn tabular-nums">
          {amount(total.toString())} {symbol} in total
        </span>
      </div>
      <ul className="mt-2 flex-1">
        {items.slice(0, PANEL_ROWS).map((row) => {
          const threshold = cards.data?.find((c) => c.id === row.card_id)?.policy
            .approval_threshold;
          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 border-t border-[#f0ddbd] py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold">{row.merchant}</span>
                <span className="block truncate text-[13px] text-[#7a3a06]">
                  {threshold
                    ? `Asks ${amount(row.amount)}, limit ${amount(threshold)}`
                    : "Flagged by the registry"}
                </span>
              </span>
              <span className="shrink-0 text-[14.5px] font-semibold tabular-nums">
                {amount(row.amount)} {symbol}
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/approvals"
        className="mt-1 flex h-10 items-center justify-center rounded-full bg-ink text-[13.5px] font-semibold text-white"
      >
        {items.length > PANEL_ROWS ? `Review all ${items.length}` : "Review and decide"}
      </Link>
    </section>
  );
}
