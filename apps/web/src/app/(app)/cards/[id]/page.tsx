"use client";
import { vaultCalls } from "@comatocard/sdk";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PaymentList } from "../../../../components/activity/PaymentList";
import { CardArtwork } from "../../../../components/card/CardArtwork";
import { AssistantSheet } from "../../../../components/cards/AssistantSheet";
import { EditPolicySheet } from "../../../../components/cards/EditPolicySheet";
import { RotateKeySheet } from "../../../../components/cards/RotateKeySheet";
import { SpendBar } from "../../../../components/cards/SpendBar";
import { ActionStatus } from "../../../../components/form/ActionStatus";
import { CardFolder } from "../../../../components/motion/card-folder";
import {
  ActionPill,
  ActionRow,
  BottomSheet,
  Button,
  Card,
  Skeleton,
  SubHeader,
} from "../../../../components/ui";
import { useCards, usePayments, useToken } from "../../../../hooks/data";
import { useNow } from "../../../../hooks/useNow";
import { type ActionState, useOwnerAction } from "../../../../hooks/useOwnerAction";
import { useOwnership } from "../../../../hooks/useOwnership";
import { useVault } from "../../../../hooks/useVault";
import {
  cardNumber,
  currentSpend,
  expiryLabel,
  keyTail,
  merchantsText,
} from "../../../../lib/cards";
import { displayUnits } from "../../../../lib/units";

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
        <Skeleton className="mx-auto mt-6 aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
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
  const spend = now ? currentSpend(card, now) : { today: "0", period: "0" };
  const p = card.policy;
  const calls = vaultCalls(vaultId);
  const live = card.status !== "revoked";

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <SubHeader title={card.label} />

      <div className="mt-6 mb-[22px] flex justify-center">
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

      <h2 className="mx-1 mt-[22px] mb-2 text-sm font-medium text-muted">Limits</h2>
      <Card className="space-y-4 px-5 py-4">
        <SpendBar
          label="Today"
          spent={spend.today}
          limit={p.daily_limit}
          decimals={decimals}
          symbol={symbol}
        />
        <SpendBar
          label="30 days"
          spent={spend.period}
          limit={p.monthly_limit}
          decimals={decimals}
          symbol={symbol}
        />
        <dl className="grid grid-cols-2 gap-y-3 border-t border-line pt-4 text-[13px]">
          <dt className="text-muted">Per payment</dt>
          <dd className="text-right font-semibold tabular-nums">
            {displayUnits(p.per_tx_limit, decimals)} {symbol}
          </dd>
          <dt className="text-muted">Ask me above</dt>
          <dd className="text-right font-semibold tabular-nums">
            {p.approval_threshold === null
              ? "Never"
              : `${displayUnits(p.approval_threshold, decimals)} ${symbol}`}
          </dd>
          <dt className="text-muted">Merchants</dt>
          <dd className="text-right font-semibold">{merchantsText(p.merchants)}</dd>
          <dt className="text-muted">Counterparty check</dt>
          <dd className="text-right font-semibold">
            {{ off: "Off", block_only: "Refuse blocked", strict: "Strict" }[p.risk_mode]}
          </dd>
          <dt className="text-muted">Held by</dt>
          <dd className="truncate text-right font-semibold">{card.holder ?? "You"}</dd>
          <dt className="text-muted">Status</dt>
          <dd className="text-right font-semibold capitalize">{card.status}</dd>
        </dl>
      </Card>

      <h2 className="mx-1 mt-[22px] mb-2 text-sm font-medium text-muted">Payments</h2>
      <Card className="px-5 pb-2 pt-1">
        <PaymentList
          rows={payments.data?.items}
          cards={undefined}
          loading={payments.isLoading}
          error={payments.error ? payments.error.message : null}
          decimals={decimals}
          symbol={symbol}
          now={now}
          emptyDescription={`Every payment ${card.label} tries, including refused ones, shows here.`}
        />
      </Card>

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

type CardSheet = "policy" | "rotate" | "revoke" | "assistant";

/** The owner's controls for a card; anyone else can still ask the assistant. */
function CardActions({
  isOwner,
  frozen,
  onToggleFreeze,
  onOpen,
  state,
  onDirect,
}: {
  isOwner: boolean;
  frozen: boolean;
  onToggleFreeze: () => void;
  onOpen: (sheet: CardSheet) => void;
  state: ActionState;
  onDirect: () => void;
}) {
  if (!isOwner) {
    return (
      <ActionRow className="mb-2">
        <ActionPill primary onClick={() => onOpen("assistant")}>
          Ask the assistant
        </ActionPill>
      </ActionRow>
    );
  }
  return (
    <>
      <ActionRow className="mb-2">
        <ActionPill primary onClick={onToggleFreeze}>
          {frozen ? "Unfreeze" : "Freeze"}
        </ActionPill>
        <ActionPill onClick={() => onOpen("policy")}>Edit limits</ActionPill>
        <ActionPill onClick={() => onOpen("assistant")}>Ask the assistant</ActionPill>
        <ActionPill onClick={() => onOpen("rotate")}>New key</ActionPill>
        <ActionPill onClick={() => onOpen("revoke")}>Revoke</ActionPill>
      </ActionRow>
      <ActionStatus state={state} onDirect={onDirect} />
    </>
  );
}
