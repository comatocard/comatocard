"use client";
import type { Card } from "@comatocard/sdk";
import { useState } from "react";
import { cardNumber, expiryLabel, keyTail } from "../../lib/cards";
import { CardArtwork } from "../card/CardArtwork";
import { CardFolder } from "../motion/card-folder";
import { Skeleton } from "../ui";

/** One card in its folder: number, expiry and key tail in the pocket, the face on the card. */
export function LeadCard({ card, loading }: { card: Card | null; loading: boolean }) {
  const [shown, setShown] = useState(false);
  if (loading) {
    return (
      <Skeleton className="mx-auto mb-[26px] aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
    );
  }
  if (!card) return null;
  const number = cardNumber(card.id);
  const expiry = expiryLabel(card.policy.expires_at);
  return (
    <div className="mb-[26px] flex justify-center">
      <CardFolder
        title={card.label}
        ariaLabel={`Card ${card.label}`}
        cardNumber={number}
        expiry={expiry}
        expiryLabel="Expires"
        cvv={keyTail(card.public_key)}
        secretLabel="Key"
        detailsVisible={shown}
        onDetailsVisibleChange={setShown}
        className="w-full max-w-[340px]"
        card={
          <CardArtwork
            label={card.label}
            number={number}
            expiry={expiry}
            kind={card.kind}
            frozen={card.status === "frozen"}
            detailsVisible={shown}
          />
        }
      />
    </div>
  );
}
