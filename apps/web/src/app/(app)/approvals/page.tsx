"use client";
import { type Payment, vaultCalls } from "@comatocard/sdk";
import { type ReactNode, useState } from "react";
import { DaoDecision } from "../../../components/approvals/DaoDecision";
import { ActionStatus } from "../../../components/form/ActionStatus";
import { Card, InfoTip, PageHeader } from "../../../components/ui";
import { PagedPanel, Pager, usePaged } from "../../../components/ui/Pager";
import { ApprovalSkeleton } from "../../../components/ui/ScreenSkeletons";
import { useApprovals, useCards, useToken } from "../../../hooks/data";
import { useDaoPolicy, useDaoProposals } from "../../../hooks/useDao";
import { useLiveFeed } from "../../../hooks/useLiveFeed";
import { useNow } from "../../../hooks/useNow";
import { type ActionState, useOwnerAction } from "../../../hooks/useOwnerAction";
import { useOwnership } from "../../../hooks/useOwnership";
import { useVault } from "../../../hooks/useVault";
import { accountUrl } from "../../../lib/config";
import type { DaoPolicy, DaoProposal } from "../../../lib/dao";
import { ago } from "../../../lib/format";
import { SmoothHeight } from "../../../lib/motion/SmoothHeight";
import { nsToMs, reasonText } from "../../../lib/payments";
import { displayUnits } from "../../../lib/units";

/**
 * Payments that wait for a decision: above a card's approval threshold, or to a merchant the
 * registry flagged. The owner, or an approver whose limit covers the amount, approves or declines.
 */
export default function ApprovalsPage() {
  const { vaultId } = useVault();
  const approvals = useApprovals(vaultId);
  const cards = useCards(vaultId);
  const token = useToken();
  const now = useNow();
  const { accountId, isOwner, owner } = useOwnership(vaultId);
  const daoPolicy = useDaoPolicy(owner);
  const dao = daoPolicy.data ? owner : null;
  const proposals = useDaoProposals(dao, Boolean(approvals.data?.items.length));
  useLiveFeed(vaultId);

  const approverLimit = approvals.data?.approvers.find(
    (a) => a.account_id === accountId,
  )?.max_amount;
  const canDecide = (row: Payment) =>
    isOwner || (approverLimit !== undefined && BigInt(row.amount) <= BigInt(approverLimit));
  const labels = new Map(cards.data?.map((c) => [c.id, c.label]));

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageHeader
        className="mb-5"
        title="Approvals"
        description="Nothing moves until you decide."
      />
      {/* The queue swaps skeleton, requests and empty state; its height follows smoothly. */}
      <SmoothHeight>
        <Queue
          loading={approvals.isLoading}
          error={approvals.error?.message}
          items={approvals.data?.items}
          render={(row) => (
            <ApprovalCard
              key={row.id}
              row={row}
              vault={vaultId ?? ""}
              cardLabel={labels.get(row.card_id) ?? `Card ${row.card_id}`}
              decimals={token.data?.decimals ?? 0}
              symbol={token.data?.symbol ?? ""}
              now={now}
              canDecide={dao === null && canDecide(row)}
              accountId={accountId}
              dao={
                dao && daoPolicy.data
                  ? { id: dao, policy: daoPolicy.data, proposals: proposals.data }
                  : null
              }
            />
          )}
        />
      </SmoothHeight>

      {approvals.data?.approvers.length ? (
        <>
          <h2 className="mx-1 mt-[26px] mb-2 text-sm font-medium text-muted">Approvers</h2>
          <Card className="divide-y divide-line px-5">
            {approvals.data.approvers.map((a) => (
              <div
                key={a.account_id}
                className="flex items-center justify-between py-3.5 text-[13.5px]"
              >
                <a
                  href={accountUrl(a.account_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold"
                >
                  {a.account_id}
                </a>
                <span className="text-muted tabular-nums">
                  up to {displayUnits(a.max_amount, token.data?.decimals ?? 0)} {token.data?.symbol}
                </span>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Queue({
  loading,
  error,
  items,
  render,
}: {
  loading: boolean;
  error: string | undefined;
  items: Payment[] | undefined;
  render: (row: Payment) => ReactNode;
}) {
  if (loading) return <ApprovalSkeleton />;
  if (error) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        The queue is not available: {error}
      </Card>
    );
  }
  if (!items?.length) {
    return (
      <Card className="p-8 text-center">
        <div className="text-[15px] font-semibold">Nothing to approve</div>
        <div className="mt-1 text-[13px] text-muted">
          Payments above a card&apos;s threshold will wait here.
        </div>
      </Card>
    );
  }
  return <PagedQueue items={items} render={render} />;
}

/**
 * One request at a time with a pager, so a long queue never stacks on a phone. The count says how
 * many wait; deciding one moves the next into view.
 */
function PagedQueue({ items, render }: { items: Payment[]; render: (row: Payment) => ReactNode }) {
  const paged = usePaged(items, 1);
  return (
    <div>
      <div className="mx-1 mb-3 flex min-h-8 items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{items.length} waiting</span>
        <Pager page={paged.page} count={paged.count} onPage={paged.go} label="requests" />
      </div>
      <PagedPanel panel={paged.panel}>{paged.items.map(render)}</PagedPanel>
      <p className="mx-1 mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
        Gasless
        <InfoTip label="Gasless">
          Your decision is signed in your wallet and sent by the relayer, which pays the gas.
        </InfoTip>
      </p>
    </div>
  );
}

function Decide({
  status,
  decided,
  onDecide,
}: {
  status: ActionState["status"];
  decided: "approve" | "decline" | null;
  onDecide: (choice: "approve" | "decline") => void;
}) {
  if (status === "confirmed") {
    return (
      <p className="mt-4 text-center text-[13px] font-semibold">
        {decided === "approve" ? "Approved, paying now" : "Declined"}
      </p>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onDecide("decline")}
        disabled={status === "signing"}
        className="h-11 rounded-full border border-line bg-white text-[14px] font-semibold disabled:opacity-40"
      >
        Decline
      </button>
      <button
        type="button"
        onClick={() => onDecide("approve")}
        disabled={status === "signing"}
        className="h-11 rounded-full text-[14px] font-semibold text-[#f8f8f8] [background:linear-gradient(180deg,#3d3d40,#171719)] disabled:opacity-40"
      >
        Approve
      </button>
    </div>
  );
}

function ApprovalCard({
  row,
  vault,
  cardLabel,
  decimals,
  symbol,
  now,
  canDecide,
  accountId,
  dao,
}: {
  accountId: string | null;
  dao: { id: string; policy: DaoPolicy; proposals: DaoProposal[] | undefined } | null;
  row: Payment;
  vault: string;
  cardLabel: string;
  decimals: number;
  symbol: string;
  now: number | null;
  canDecide: boolean;
}) {
  const { state, run, runDirect } = useOwnerAction(vault);
  const [decided, setDecided] = useState<"approve" | "decline" | null>(null);
  const calls = vaultCalls(vault);
  const paymentId = row.id;

  const decide = async (choice: "approve" | "decline") => {
    setDecided(choice);
    await run(
      choice === "approve" ? calls.approvePayment(paymentId) : calls.declinePayment(paymentId),
    );
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-muted">{cardLabel} wants to pay</div>
          <a
            href={accountUrl(row.merchant)}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-[16px] font-semibold"
          >
            {row.merchant}
          </a>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-semibold tabular-nums">
            {displayUnits(row.amount, decimals)}
          </div>
          <div className="text-[12px] text-muted">{symbol}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
        <span>Waiting: {row.queue_cause ? reasonText(row.queue_cause) : "queued"}</span>
        {row.reference ? <span>Ref {row.reference}</span> : null}
        {row.memo ? <span>{row.memo}</span> : null}
        {now ? <span>{ago(nsToMs(row.created_at), now)}</span> : null}
      </div>
      {dao ? (
        <DaoDecision
          dao={dao.id}
          policy={dao.policy}
          proposals={dao.proposals}
          vault={vault}
          paymentId={row.id}
          accountId={accountId}
        />
      ) : null}
      {!dao && canDecide ? (
        <Decide status={state.status} decided={decided} onDecide={(c) => void decide(c)} />
      ) : null}
      {!dao && !canDecide ? (
        <p className="mt-4 text-[12.5px] text-muted">Only the owner or an approver can decide.</p>
      ) : null}
      {state.status === "confirmed" ? null : (
        <ActionStatus state={state} onDirect={() => void runDirect()} />
      )}
    </Card>
  );
}
