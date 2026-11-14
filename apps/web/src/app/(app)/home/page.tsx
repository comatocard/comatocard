"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PaymentList } from "../../../components/activity/PaymentList";
import { CardList } from "../../../components/cards/CardList";
import { NewCardSheet } from "../../../components/cards/NewCardSheet";
import { ApprovalBanner, ApprovalPanel } from "../../../components/home/ApprovalBanner";
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
const ACTIVITY_PAGE = { phone: 3, desktop: 4 } as const;

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
  useLiveFeed(vault);
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

  const actions = isOwner ? (
    <>
      <ActionPill primary onClick={() => setSheet("card")}>
        New card
      </ActionPill>
      <ActionPill onClick={() => setSheet("topup")}>Top up</ActionPill>
    </>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[560px] lg:max-w-none">
      <div className="lg:mb-6 lg:flex lg:items-center lg:justify-between">
        <VaultPicker owner={accountId} onCreate={() => setSheet("vault")} />
        {actions ? <div className="hidden items-center gap-2 lg:flex">{actions}</div> : null}
      </div>

      {/* A phone stacks these; a desktop sets them as two equal columns whose rows share a height:
          balance beside approvals, then cards beside activity. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <div className="lg:rounded-card lg:border lg:border-white lg:bg-card lg:px-6">
          <AvailableHero
            available={balance?.available}
            reserved={balance?.reserved}
            decimals={token.data?.decimals}
            symbol={symbol}
            today={today}
          />
        </div>
        <ApprovalPanel vault={vault} className="hidden lg:flex" />

        <div className="lg:hidden">
          <ApprovalBanner vault={vault} className="mb-5" />
          {actions ? <ActionRow className="mb-6">{actions}</ActionRow> : null}
          <CardCarousel
            cards={cards.data}
            loading={cards.isLoading}
            vault={vault}
            decimals={decimals}
            symbol={symbol}
            now={now}
          />
        </div>

        <section className="hidden lg:flex lg:flex-col">
          <SectionHead title="Cards">
            <span className="text-[12px] text-muted">
              {cards.data?.length === 1 ? "1 card" : `${cards.data?.length ?? 0} cards`}
            </span>
          </SectionHead>
          <Card className="flex-1 px-5 pt-0.5 pb-3">
            <CardList
              cards={cards.data}
              loading={cards.isLoading}
              error={cards.error?.message}
              vault={vault}
              decimals={decimals}
              symbol={symbol}
              now={now}
            />
            {isOwner ? (
              <button
                type="button"
                onClick={() => setSheet("card")}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 text-[13.5px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                New card
              </button>
            ) : null}
          </Card>
        </section>

        <section className="mt-8 lg:mt-0 lg:flex lg:flex-col">
          <SectionHead title="Activity">
            <div className="flex items-center gap-3">
              <Pager
                page={activity.page}
                count={activity.count}
                onPage={activity.go}
                label="activity"
              />
              <Link href="/activity" className="text-[13px] font-semibold text-ink-2">
                See all
              </Link>
            </div>
          </SectionHead>
          <Card className="px-5 pt-1 pb-2 lg:flex-1">
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
