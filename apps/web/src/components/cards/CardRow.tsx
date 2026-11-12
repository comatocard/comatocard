import type { Card } from "@comatocard/sdk";
import Link from "next/link";
import { currentSpend, KIND_LABEL } from "../../lib/cards";
import { SpendBar } from "./SpendBar";

const STATUS_CHIP = {
  active: null,
  frozen: "bg-[#e8eef7] text-[#3b5b8c]",
  revoked: "bg-pill text-muted",
} as const;

/** A card in the vault list: name, holder kind, today's spend against the day limit. */
export function CardRow({
  card,
  vault,
  decimals,
  symbol,
  now,
  first,
}: {
  card: Card;
  vault: string;
  decimals: number;
  symbol: string;
  now: number | null;
  first: boolean;
}) {
  const spend = now ? currentSpend(card, now) : null;
  const chip = STATUS_CHIP[card.status];
  return (
    <Link
      href={`/cards/${card.id}?vault=${encodeURIComponent(vault)}`}
      className={`block py-3.5 text-inherit no-underline ${first ? "" : "border-t border-line"}`}
    >
      <div className="flex items-center gap-[13px]">
        <span className="grid h-9 w-14 shrink-0 place-items-end rounded-[7px] bg-[linear-gradient(135deg,#2b2d2b,#0b0c0d)] p-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-white/80">
          {String(card.id).padStart(4, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[14px] font-semibold">{card.label}</span>
            {chip ? (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${chip}`}
              >
                {card.status}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] font-medium text-muted">
                {KIND_LABEL[card.kind]}
              </span>
            )}
          </div>
          {card.status === "revoked" || !spend ? (
            <div className="mt-1 text-xs text-muted">{KIND_LABEL[card.kind]} card</div>
          ) : (
            <div className="mt-2">
              <SpendBar
                label="Today"
                spent={spend.today}
                limit={card.policy.daily_limit}
                decimals={decimals}
                symbol={symbol}
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
