"use client";
import { paymentPage } from "@comatocard/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PaymentList } from "../../../components/activity/PaymentList";
import { Card, LoadMore, PageHeader, SubHeader } from "../../../components/ui";
import { keys, useCards, useToken } from "../../../hooks/data";
import { useLiveFeed } from "../../../hooks/useLiveFeed";
import { useNow } from "../../../hooks/useNow";
import { useVault } from "../../../hooks/useVault";
import { exportCsvUrl, indexerGet } from "../../../lib/indexer";

const FILTERS = [
  { key: "all", label: "All", status: undefined },
  { key: "settled", label: "Paid", status: "settled" },
  { key: "queued", label: "Waiting", status: "queued" },
  { key: "rejected", label: "Refused", status: "rejected" },
  { key: "failed", label: "Failed", status: "failed" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

/** Every payment attempt of the vault, newest first, with the reason for each refusal. */
export default function ActivityPage() {
  const { vaultId } = useVault();
  const token = useToken();
  const cards = useCards(vaultId);
  const now = useNow();
  const [filter, setFilter] = useState<FilterKey>("all");
  const status = FILTERS.find((f) => f.key === filter)?.status;
  useLiveFeed(vaultId);

  const history = useInfiniteQuery({
    queryKey: [...keys.payments(vaultId ?? ""), "history", filter],
    queryFn: ({ pageParam }) =>
      indexerGet(`vaults/${vaultId}/payments`, paymentPage, {
        status,
        cursor: pageParam ?? undefined,
        limit: "50",
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(vaultId),
  });
  const rows = history.data?.pages.flatMap((p) => p.items);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="lg:hidden">
        <SubHeader title="History" />
      </div>
      <div className="hidden lg:block">
        <PageHeader
          className="mb-5"
          title="History"
          description="Every payment your cards tried, refused ones included."
        />
      </div>
      <div className="-mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`h-9 shrink-0 rounded-full border px-4 text-[13px] font-semibold ${
              filter === f.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Card className="px-5 pb-2 pt-1">
        <PaymentList
          rows={rows}
          cards={cards.data}
          loading={history.isLoading}
          error={history.error ? history.error.message : null}
          decimals={token.data?.decimals ?? 0}
          symbol={token.data?.symbol ?? ""}
          now={now}
        />
      </Card>
      {history.hasNextPage ? (
        <div className="mt-3">
          <LoadMore onClick={() => void history.fetchNextPage()} />
        </div>
      ) : null}
      {vaultId ? (
        <a
          href={exportCsvUrl(vaultId)}
          className="mt-5 block text-center text-[13.5px] font-semibold text-ink-2 underline"
        >
          Download CSV for your accountant
        </a>
      ) : null}
    </div>
  );
}
