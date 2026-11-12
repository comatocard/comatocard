"use client";
import type { PaymentPage, Card as VaultCard } from "@comatocard/sdk";
import { useRef, useState } from "react";
import { useStepSwap } from "../../lib/motion/useStepSwap";
import { PaymentList } from "../activity/PaymentList";
import { Card } from "../ui";
import { PagedPanel, Pager, usePaged } from "../ui/Pager";
import { Tabs } from "../ui/Tabs";
import { LimitsPanel } from "./LimitsPanel";

type Tab = "limits" | "payments";
const TABS: readonly Tab[] = ["limits", "payments"];
/** Payments per page on the Payments tab. */
const PAYMENTS_PAGE = 5;

/**
 * The card's Limits and Payments, one tab at a time: the thumb glides, the panel slides toward the
 * tab chosen, and payments page five at a time.
 */
export function CardDetails({
  card,
  payments,
  now,
  decimals,
  symbol,
}: {
  card: VaultCard;
  payments: { data: PaymentPage | undefined; isLoading: boolean; error: Error | null };
  now: number | null;
  decimals: number;
  symbol: string;
}) {
  const [tab, setTab] = useState<Tab>("limits");
  const panel = useRef<HTMLDivElement>(null);
  const swap = useStepSwap(panel, TABS.indexOf(tab));
  const paged = usePaged(payments.data?.items, PAYMENTS_PAGE, card.id);
  const count = payments.data?.items.length;

  return (
    <>
      <div className="mt-6 mb-3">
        <Tabs
          label="Card details"
          value={tab}
          onChange={(next) => swap(TABS.indexOf(next), () => setTab(next))}
          items={[
            { value: "limits", label: "Limits" },
            { value: "payments", label: "Payments", ...(count ? { badge: count } : {}) },
          ]}
        />
      </div>
      <div className="overflow-hidden">
        <div ref={panel}>
          {tab === "limits" ? (
            <LimitsPanel card={card} now={now} decimals={decimals} symbol={symbol} />
          ) : (
            <Card className="px-5 pt-1 pb-2">
              <div className="flex justify-end pt-3 empty:hidden">
                <Pager page={paged.page} count={paged.count} onPage={paged.go} label="payments" />
              </div>
              <PagedPanel panel={paged.panel}>
                <PaymentList
                  rows={payments.data ? paged.items : undefined}
                  cards={undefined}
                  loading={payments.isLoading}
                  error={payments.error ? payments.error.message : null}
                  decimals={decimals}
                  symbol={symbol}
                  now={now}
                  emptyDescription={`Every payment ${card.label} tries, including refused ones, shows here.`}
                />
              </PagedPanel>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
