import type { Card } from "@comatocard/sdk";
import { Skeleton } from "../ui";
import { CardRow } from "./CardRow";

/** Every card of the vault with today's spend, or why there is nothing to show. */
export function CardList({
  cards,
  loading,
  error,
  vault,
  decimals,
  symbol,
  now,
}: {
  cards: Card[] | undefined;
  loading: boolean;
  error: string | undefined;
  vault: string;
  decimals: number;
  symbol: string;
  now: number | null;
}) {
  if (error) {
    return (
      <div className="py-6 text-center text-sm text-muted">Cards could not be read: {error}</div>
    );
  }
  if (loading && !cards) return <Skeleton className="my-4 h-10 w-full" />;
  if (!cards?.length) {
    return (
      <div className="py-6 text-center">
        <div className="text-[14px] font-semibold">No cards yet</div>
        <div className="mt-1 text-xs text-muted">Issue one for an agent or a person.</div>
      </div>
    );
  }
  return (
    <>
      {cards.map((card, i) => (
        <CardRow
          key={card.id}
          card={card}
          vault={vault}
          decimals={decimals}
          symbol={symbol}
          now={now}
          first={i === 0}
        />
      ))}
    </>
  );
}
