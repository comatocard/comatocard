"use client";
import { vaultCalls } from "@comatocard/sdk";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CardArtwork } from "../../../../components/card/CardArtwork";
import { AssistantSheet } from "../../../../components/cards/AssistantSheet";
import { CardActions, type CardSheet } from "../../../../components/cards/CardActions";
import { CardDetails } from "../../../../components/cards/CardDetails";
import { EditPolicySheet } from "../../../../components/cards/EditPolicySheet";
import { RotateKeySheet } from "../../../../components/cards/RotateKeySheet";
import { CardFolder } from "../../../../components/motion/card-folder";
import { BottomSheet, Button, InfoTip, SubHeader } from "../../../../components/ui";
import { CardScreenSkeleton } from "../../../../components/ui/ScreenSkeletons";
import { useCards, usePayments, useToken } from "../../../../hooks/data";
import { useNow } from "../../../../hooks/useNow";
import { useOwnerAction } from "../../../../hooks/useOwnerAction";
import { useOwnership } from "../../../../hooks/useOwnership";
import { useVault } from "../../../../hooks/useVault";
import { cardChips, cardNumber, expiryLabel, keyTail } from "../../../../lib/cards";

/** The dot before the status word: green while the card can pay. */
const STATUS_DOT = { active: "bg-pos", frozen: "bg-[#3b5b8c]", revoked: "bg-faint" } as const;

export default function CardPage() {
  return (
    <Suspense fallback={null}>
      <CardScreen />
    </Suspense>
  );
}

function CardScreen() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { vaultId, setVaultId } = useVault();
  // A shared link names its vault; opening it switches to that vault.
  const linked = search.get("vault");
  useEffect(() => {
    if (linked && linked !== vaultId) setVaultId(linked);
  }, [linked, vaultId, setVaultId]);

  const id = Number(params.id);
  const cards = useCards(vaultId);
  const card = cards.data?.find((c) => c.id === id) ?? null;
  const token = useToken();
  const payments = usePayments(vaultId, id);
  const { isOwner } = useOwnership(vaultId);
  const now = useNow();
  const [shown, setShown] = useState(false);
  const [sheet, setSheet] = useState<CardSheet | null>(null);
  const { state, run, runDirect, reset } = useOwnerAction(vaultId);

  if (!vaultId || cards.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <SubHeader title="Card" />
        <CardScreenSkeleton />
      </div>
    );
  }
  if (cards.error) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <SubHeader title="Card" />
        <p className="mt-10 text-center text-sm text-muted">
          The card could not be read: {cards.error.message}
        </p>
        <button
          type="button"
          onClick={() => void cards.refetch()}
          className="mx-auto mt-3 block text-[13px] font-semibold underline"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <SubHeader title="Card" />
        <p className="mt-10 text-center text-sm text-muted">
          This card account has no card {params.id}.
        </p>
      </div>
    );
  }

  const symbol = token.data?.symbol ?? "";
  const decimals = token.data?.decimals ?? 0;
  const p = card.policy;
  const calls = vaultCalls(vaultId);
  const live = card.status !== "revoked";
  const chips = cardChips(card);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <SubHeader title={card.label} />

      <div className="mt-6 mb-4 flex justify-center">
        <CardFolder
          title={card.label}
          ariaLabel={`Card ${card.label}`}
          cardNumber={cardNumber(card.id)}
          expiry={expiryLabel(p.expires_at)}
          expiryLabel="Expires"
          cvv={keyTail(card.public_key)}
          secretLabel="Key"
          detailsVisible={shown}
          onDetailsVisibleChange={setShown}
          className="w-full max-w-[340px]"
          card={
            <CardArtwork
              label={card.label}
              number={cardNumber(card.id)}
              expiry={expiryLabel(p.expires_at)}
              kind={card.kind}
              frozen={card.status === "frozen"}
              detailsVisible={shown}
            />
          }
        />
      </div>

      {/* Plain text, not pills: these describe the card and are not controls. */}
      <ul
        className="mb-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] font-medium text-muted"
        aria-label="Card status"
      >
        {chips.map((chip, i) => (
          <li key={chip} className="flex items-center gap-1.5">
            {i === 0 ? (
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${STATUS_DOT[card.status]}`}
              />
            ) : (
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
            )}
            <span className={i === 0 ? "text-ink" : undefined}>{chip}</span>
            {chip === "Registry check" ? (
              <InfoTip label="Registry check">
                Before each payment the vault looks the merchant up in the counterparty registry.
                The card's limits decide which verdicts it refuses.
              </InfoTip>
            ) : null}
          </li>
        ))}
      </ul>

      {live ? (
        <CardActions
          isOwner={isOwner}
          frozen={card.status === "frozen"}
          onToggleFreeze={() =>
            void run(
              card.status === "frozen" ? calls.unfreezeCard(card.id) : calls.freezeCard(card.id),
            )
          }
          onOpen={setSheet}
          state={state}
          onDirect={() => void runDirect()}
        />
      ) : null}

      <CardDetails card={card} payments={payments} now={now} decimals={decimals} symbol={symbol} />

      {isOwner && live ? (
        <button
          type="button"
          onClick={() => setSheet("revoke")}
          className="mx-auto mt-6 block text-[13px] font-semibold text-neg"
        >
          Revoke card
        </button>
      ) : null}

      {live ? (
        <AssistantSheet
          open={sheet === "assistant"}
          onClose={() => setSheet(null)}
          vault={vaultId}
          card={card}
          canSign={isOwner}
        />
      ) : null}
      {isOwner && live ? (
        <>
          <EditPolicySheet
            open={sheet === "policy"}
            onClose={() => setSheet(null)}
            vault={vaultId}
            card={card}
          />
          <RotateKeySheet
            open={sheet === "rotate"}
            onClose={() => setSheet(null)}
            vault={vaultId}
            card={card}
          />
          <BottomSheet open={sheet === "revoke"} onClose={() => setSheet(null)} label="Revoke card">
            <h2 className="mb-1 text-xl font-semibold">Revoke {card.label}?</h2>
            <p className="mb-5 text-sm text-muted">
              The key is deleted and the card can never pay again. This can&apos;t be undone; issue
              a new card instead. Past payments stay on record.
            </p>
            <Button
              onClick={() =>
                void run(calls.revokeCard(card.id)).then((ok) => {
                  if (ok) setSheet(null);
                })
              }
              disabled={state.status === "signing"}
            >
              {state.status === "signing" ? "Confirm in your wallet…" : "Revoke for good"}
            </Button>
            <button
              type="button"
              onClick={() => {
                reset();
                setSheet(null);
              }}
              className="mt-3 h-12 w-full text-[15px] font-semibold text-muted"
            >
              Cancel
            </button>
          </BottomSheet>
        </>
      ) : null}
      {card.status === "revoked" ? (
        <p className="mt-4 text-center text-[13px] text-muted">
          This card was revoked. It can no longer pay; its payments stay on record.
        </p>
      ) : null}
    </div>
  );
}
