"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PaymentList } from "../../../components/activity/PaymentList";
import { CardList } from "../../../components/cards/CardList";
import { NewCardSheet } from "../../../components/cards/NewCardSheet";
import { ApprovalBanner } from "../../../components/home/ApprovalBanner";
import { AvailableHero } from "../../../components/home/AvailableHero";
import { CardCarousel } from "../../../components/home/CardCarousel";
import { CreateVaultSheet } from "../../../components/home/CreateVaultSheet";
import { TopUpSheet } from "../../../components/home/TopUpSheet";
import { VaultPicker } from "../../../components/home/VaultPicker";
import { ActionPill, ActionRow, Card } from "../../../components/ui";
import { PagedPanel, Pager, usePaged } from "../../../components/ui/Pager";
import { tokenBalance, useBalances, useCards, usePayments, useToken } from "../../../hooks/data";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { useLiveFeed } from "../../../hooks/useLiveFeed";
import { useNow } from "../../../hooks/useNow";
import { useOwnership } from "../../../hooks/useOwnership";
import { useVault } from "../../../hooks/useVault";
import { spentToday } from "../../../lib/cards";

/** Rows per page of activity: a phone shows three, so nothing stacks past the fold. */
const ACTIVITY_PAGE = { phone: 3, desktop: 5 } as const;

/** Home: what the account can pay, its cards, and the latest payments, a page at a time. */
export default function HomePage() {
  // VaultGuard only renders this once the account's own vault is open.
  const { vaultId } = useVault();
  return vaultId ? <VaultHome vault={vaultId} /> : null;
}

function SectionHead({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mx-1 mb-2 flex min-h-8 items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function VaultHome({ vault }: { vault: string }) {
  const { isOwner, accountId } = useOwnership(vault);
  const isDesktop = useIsDesktop();
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
  const today = useMemo(
    () => (cards.data && now ? spentToday(cards.data, now) : null),
    [cards.data, now],
  );
  const activity = usePaged(
    payments.data?.items,
    isDesktop ? ACTIVITY_PAGE.desktop : ACTIVITY_PAGE.phone,
    vault,
  );

  return (
    <div className="mx-auto w-full max-w-[560px] lg:grid lg:max-w-none lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12">
      <div>
        <VaultPicker owner={accountId} onCreate={() => setSheet("vault")} />
        <AvailableHero
          available={balance?.available}
          reserved={balance?.reserved}
          decimals={token.data?.decimals}
          symbol={symbol}
          today={today}
        />
        <ApprovalBanner vault={vault} className="mb-5 lg:hidden" />
        {isOwner ? (
          <ActionRow className="mb-6">
            <ActionPill primary onClick={() => setSheet("card")}>
              New card
            </ActionPill>
            <ActionPill onClick={() => setSheet("topup")}>Top up</ActionPill>
          </ActionRow>
        ) : null}
        <CardCarousel
          cards={cards.data}
          loading={cards.isLoading}
          vault={vault}
          decimals={decimals}
          symbol={symbol}
          now={now}
        />
      </div>

      <div className="mt-8 space-y-7 lg:mt-0">
        <ApprovalBanner vault={vault} className="hidden lg:flex" />

        <section className="hidden lg:block">
          <SectionHead title="Cards">
            <span className="text-[12px] text-muted">{cards.data?.length ?? 0}</span>
          </SectionHead>
          <Card className="px-5 pt-0.5 pb-1">
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
        </section>

        <section>
          <SectionHead
            title={
              <>
                Activity
                <span
                  title={feed === "live" ? "Live" : "Reconnecting"}
                  className={`inline-block size-1.5 rounded-full ${feed === "live" ? "bg-pos" : "bg-faint"}`}
                />
              </>
            }
          >
            <div className="flex items-center gap-3">
              <Pager
                page={activity.page}
                count={activity.count}
                onPage={activity.go}
                label="activity"
              />
              <Link href="/activity" className="text-[13px] font-semibold text-ink-2">
                All
              </Link>
            </div>
          </SectionHead>
          <Card className="px-5 pt-1 pb-2">
            <PagedPanel panel={activity.panel}>
              <PaymentList
                rows={payments.data ? activity.items : undefined}
                cards={cards.data}
                loading={payments.isLoading}
                error={payments.error?.message ?? null}
                decimals={decimals}
                symbol={symbol}
                now={now}
              />
            </PagedPanel>
          </Card>
        </section>
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
