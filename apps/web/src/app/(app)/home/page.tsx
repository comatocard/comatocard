"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PaymentList } from "../../../components/activity/PaymentList";
import { CardList } from "../../../components/cards/CardList";
import { NewCardSheet } from "../../../components/cards/NewCardSheet";
import { AvailableHero } from "../../../components/home/AvailableHero";
import { CreateVaultSheet } from "../../../components/home/CreateVaultSheet";
import { LeadCard } from "../../../components/home/LeadCard";
import { TopUpSheet } from "../../../components/home/TopUpSheet";
import { VaultPicker } from "../../../components/home/VaultPicker";
import { ActionPill, ActionRow, Card } from "../../../components/ui";
import { tokenBalance, useBalances, useCards, usePayments, useToken } from "../../../hooks/data";
import { useLiveFeed } from "../../../hooks/useLiveFeed";
import { useNow } from "../../../hooks/useNow";
import { useOwnership } from "../../../hooks/useOwnership";
import { useVault } from "../../../hooks/useVault";

/** Home: what the vault can pay, its lead card, every card's spend, and the latest payments. */
export default function HomePage() {
  // VaultGuard only renders this once the account's own vault is open.
  const { vaultId } = useVault();
  return vaultId ? <VaultHome vault={vaultId} /> : null;
}

function VaultHome({ vault }: { vault: string }) {
  const { isOwner, accountId } = useOwnership(vault);
  const token = useToken();
  const balances = useBalances(vault);
  const cards = useCards(vault);
  const payments = usePayments(vault);
  const feed = useLiveFeed(vault);
  const now = useNow();
  const [sheet, setSheet] = useState<"card" | "topup" | "vault" | null>(null);
  const close = () => setSheet(null);

  const balance = tokenBalance(balances.data);
  const symbol = token.data?.symbol ?? "";
  const decimals = token.data?.decimals ?? 0;
  // The folder holds the newest card that can still pay.
  const lead = useMemo(
    () => [...(cards.data ?? [])].reverse().find((c) => c.status !== "revoked") ?? null,
    [cards.data],
  );

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <VaultPicker owner={accountId} onCreate={() => setSheet("vault")} />

      <div className="stagger">
        <AvailableHero
          available={balance?.available}
          reserved={balance?.reserved}
          decimals={token.data?.decimals}
          symbol={symbol}
        />

        {isOwner ? (
          <ActionRow className="mb-[22px]">
            <ActionPill primary onClick={() => setSheet("card")}>
              New card
            </ActionPill>
            <ActionPill onClick={() => setSheet("topup")}>Top up</ActionPill>
          </ActionRow>
        ) : null}

        <LeadCard card={lead} loading={cards.isLoading} />

        <div className="mx-1 mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Cards</h2>
          <span className="text-[12px] text-muted">{cards.data?.length ?? 0}</span>
        </div>
        <Card className="mb-[22px] px-5 pb-1 pt-0.5">
          <CardList
            cards={cards.data}
            loading={cards.isLoading}
            error={cards.error?.message}
            vault={vault}
            decimals={decimals}
            symbol={symbol}
            now={now}
          />
        </Card>

        <div className="mx-1 mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted">
            History
            <span
              title={feed === "live" ? "Live" : "Reconnecting"}
              className={`inline-block size-1.5 rounded-full ${feed === "live" ? "bg-pos" : "bg-faint"}`}
            />
          </h2>
          <Link href="/activity" className="text-[13px] font-semibold text-ink-2">
            See all
          </Link>
        </div>
        <Card className="px-5 pb-2 pt-1">
          <PaymentList
            rows={payments.data?.items.slice(0, 5)}
            cards={cards.data}
            loading={payments.isLoading}
            error={payments.error?.message ?? null}
            decimals={decimals}
            symbol={symbol}
            now={now}
          />
        </Card>
      </div>

      {isOwner && accountId ? (
        <>
          <NewCardSheet open={sheet === "card"} onClose={close} vault={vault} />
          <TopUpSheet open={sheet === "topup"} onClose={close} owner={accountId} vault={vault} />
        </>
      ) : null}
      {accountId ? (
        <CreateVaultSheet open={sheet === "vault"} onClose={close} owner={accountId} />
      ) : null}
    </div>
  );
}
