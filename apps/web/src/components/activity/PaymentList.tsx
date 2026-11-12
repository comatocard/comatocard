"use client";
import type { Card, PaymentRow as Row } from "@comatocard/sdk";
import { Skeleton } from "../ui";
import { PaymentRow } from "./PaymentRow";

/** A list of payment rows with loading, error and empty states. */
export function PaymentList({
  rows,
  cards,
  loading,
  error,
  decimals,
  symbol,
  now,
  emptyTitle = "No payments yet",
  emptyDescription = "Payments from your cards, including refused ones, show here.",
}: {
  rows: Row[] | undefined;
  cards: Card[] | undefined;
  loading: boolean;
  error: string | null;
  decimals: number;
  symbol: string;
  now: number | null;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (loading && !rows) {
    return (
      <div className="py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-[13px] py-3.5">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error && !rows) {
    return (
      <div className="py-6 text-center">
        <div className="text-[14px] font-semibold">History is not available</div>
        <div className="mt-1 text-xs text-muted">{error}</div>
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="py-6 text-center">
        <div className="text-[14px] font-semibold">{emptyTitle}</div>
        <div className="mt-1 text-xs text-muted">{emptyDescription}</div>
      </div>
    );
  }
  const labels = new Map(cards?.map((c) => [c.id, c.label]));
  return (
    <div>
      {rows.map((row, i) => (
        <PaymentRow
          key={row.id}
          row={row}
          decimals={decimals}
          symbol={symbol}
          now={now}
          first={i === 0}
          cardLabel={labels.get(row.card_id)}
        />
      ))}
    </div>
  );
}
