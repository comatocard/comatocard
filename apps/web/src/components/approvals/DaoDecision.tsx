"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useOwnerAction } from "../../hooks/useOwnerAction";
import { EXPLORER_URL } from "../../lib/config";
import {
  actProposalCall,
  addProposalCall,
  type DaoPolicy,
  type DaoProposal,
  type Decision,
  isCouncil,
  proposalDecision,
} from "../../lib/dao";
import { formatUnits } from "../../lib/units";
import { ActionStatus } from "../form/ActionStatus";

const votes = (p: DaoProposal) =>
  Object.values(p.vote_counts ?? {}).reduce(
    (sum, counts) => ({
      yes: sum.yes + Number(counts[0] ?? 0),
      no: sum.no + Number(counts[1] ?? 0),
    }),
    { yes: 0, no: 0 },
  );

/**
 * The DAO's side of one queued payment: its proposals, the votes, and what the visitor can do.
 * Proposals attach the DAO's bond and go to the DAO, so they are signed from the wallet.
 */
export function DaoDecision({
  dao,
  policy,
  proposals,
  vault,
  paymentId,
  accountId,
}: {
  dao: string;
  policy: DaoPolicy;
  proposals: DaoProposal[] | undefined;
  vault: string;
  paymentId: number;
  accountId: string | null;
}) {
  const { state, runDirect } = useOwnerAction(vault);
  const queryClient = useQueryClient();
  const mine = (proposals ?? []).filter((p) => proposalDecision(p, vault)?.paymentId === paymentId);
  const open = mine.filter((p) => p.status === "InProgress");
  const council = accountId !== null && isCouncil(policy, accountId);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["dao", dao] });

  const propose = (method: Decision) =>
    void runDirect([addProposalCall(dao, policy.proposal_bond, vault, method, paymentId)]).then(
      refresh,
    );
  const vote = (p: DaoProposal, action: "VoteApprove" | "VoteReject") =>
    void runDirect([actProposalCall(dao, p, action)]).then(refresh);

  return (
    <div className="mt-4 rounded-2xl bg-pill px-3.5 py-3 text-[12.5px]">
      <div className="font-semibold">Owned by the DAO {dao}</div>
      {mine.length === 0 ? (
        <p className="mt-0.5 text-muted">
          No proposal yet. A council member proposes, then the council votes.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {mine.map((p) => {
            const decision = proposalDecision(p, vault);
            const v = votes(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`${EXPLORER_URL}/address/${dao}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  #{p.id} {decision?.method === "approve_payment" ? "Approve" : "Decline"}
                </a>
                <span className="text-muted">
                  {p.status} · {v.yes} yes, {v.no} no
                </span>
                {council && p.status === "InProgress" ? (
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => vote(p, "VoteReject")}
                      className="rounded-full border border-line bg-white px-3 py-1 font-semibold"
                    >
                      Vote no
                    </button>
                    <button
                      type="button"
                      onClick={() => vote(p, "VoteApprove")}
                      className="rounded-full bg-ink px-3 py-1 font-semibold text-white"
                    >
                      Vote yes
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {council && open.length === 0 ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => propose("decline_payment")}
            className="h-10 rounded-full border border-line bg-white font-semibold"
          >
            Propose decline
          </button>
          <button
            type="button"
            onClick={() => propose("approve_payment")}
            className="h-10 rounded-full bg-ink font-semibold text-white"
          >
            Propose approval
          </button>
        </div>
      ) : null}
      {council ? (
        <p className="mt-2 text-muted">
          A proposal attaches the DAO bond of {formatUnits(policy.proposal_bond, 24)} NEAR.
        </p>
      ) : (
        <p className="mt-2 text-muted">Only council members propose and vote.</p>
      )}
      <ActionStatus state={state} />
    </div>
  );
}
