import { type AccountId, type FunctionCall, u128, viewFunction } from "@comatocard/sdk";
import { z } from "zod";
import { RPC_URL } from "./config";

// Sputnik DAO v2 as a vault owner (`docs/integration.md`, tested in contracts/vault/tests/dao.rs).
// The DAO decides a queued payment through a FunctionCall proposal on the vault.

const role = z.object({
  name: z.string(),
  kind: z.union([
    z.literal("Everyone"),
    z.object({ Group: z.array(z.string()) }),
    z.record(z.string(), z.unknown()),
  ]),
  permissions: z.array(z.string()),
});

export const daoPolicy = z.object({ roles: z.array(role), proposal_bond: u128 });
export type DaoPolicy = z.infer<typeof daoPolicy>;

const proposalAction = z.object({ method_name: z.string(), args: z.string() });
const functionCallKind = z.object({
  FunctionCall: z.object({ receiver_id: z.string(), actions: z.array(proposalAction) }),
});

export const daoProposal = z.object({
  id: z.number().int().nonnegative(),
  proposer: z.string(),
  description: z.string(),
  kind: z.unknown(),
  status: z.string(),
  vote_counts: z.record(z.string(), z.array(z.union([z.number(), z.string()]))).optional(),
  submission_time: z.string(),
});
export type DaoProposal = z.infer<typeof daoProposal>;

/** Gas the proposal's action gets; `approve_payment` needs at least 80 Tgas. */
const ACTION_GAS = "150000000000000";
const ADD_GAS = "50000000000000";
const ACT_GAS = "300000000000000";

export type Decision = "approve_payment" | "decline_payment";

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCodePoint(byte);
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0));
}

/** The proposal kind that calls `approve_payment` or `decline_payment` on the vault. */
export const decisionKind = (vault: AccountId, method: Decision, paymentId: number) => ({
  FunctionCall: {
    receiver_id: vault,
    actions: [
      {
        method_name: method,
        args: toBase64(JSON.stringify({ payment_id: paymentId })),
        deposit: "0",
        gas: ACTION_GAS,
      },
    ],
  },
});

/** The decision a proposal makes about one payment of `vault`, or null for any other proposal. */
export function proposalDecision(
  proposal: DaoProposal,
  vault: AccountId,
): { method: Decision; paymentId: number } | null {
  const kind = functionCallKind.safeParse(proposal.kind);
  if (!kind.success || kind.data.FunctionCall.receiver_id !== vault) return null;
  const action = kind.data.FunctionCall.actions[0];
  if (
    !action ||
    (action.method_name !== "approve_payment" && action.method_name !== "decline_payment")
  ) {
    return null;
  }
  try {
    const args = z
      .object({ payment_id: z.number().int() })
      .parse(JSON.parse(fromBase64(action.args)));
    return { method: action.method_name, paymentId: args.payment_id };
  } catch {
    return null;
  }
}

/** Whether `account` belongs to a role of the DAO that may vote. */
export function isCouncil(policy: DaoPolicy, account: string): boolean {
  return policy.roles.some((r) => {
    const canVote = r.permissions.some(
      (p) => p === "*:*" || p.endsWith(":VoteApprove") || p === "*:VoteApprove",
    );
    if (!canVote) return false;
    if (r.kind === "Everyone") return true;
    const group = (r.kind as { Group?: unknown }).Group;
    return Array.isArray(group) && group.includes(account);
  });
}

export const addProposalCall = (
  dao: AccountId,
  bond: string,
  vault: AccountId,
  method: Decision,
  paymentId: number,
): FunctionCall => ({
  receiverId: dao,
  methodName: "add_proposal",
  args: {
    proposal: {
      description: `${method === "approve_payment" ? "Approve" : "Decline"} payment ${paymentId} of ${vault}`,
      kind: decisionKind(vault, method, paymentId),
    },
  },
  gas: ADD_GAS,
  deposit: bond,
});

/** Votes on a proposal; newer Sputnik versions require the kind to be repeated. */
export const actProposalCall = (
  dao: AccountId,
  proposal: DaoProposal,
  action: "VoteApprove" | "VoteReject",
): FunctionCall => ({
  receiverId: dao,
  methodName: "act_proposal",
  args: { id: proposal.id, action, proposal: proposal.kind },
  gas: ACT_GAS,
  deposit: "0",
});

/** The DAO's policy, or null when the account is not a Sputnik DAO. */
export async function readDaoPolicy(account: AccountId): Promise<DaoPolicy | null> {
  try {
    return await viewFunction({ rpcUrl: RPC_URL }, account, "get_policy", {}, daoPolicy);
  } catch {
    return null;
  }
}

/** The most recent proposals, newest last, as the DAO lists them. */
export async function readProposals(dao: AccountId, count = 50): Promise<DaoProposal[]> {
  const last = await viewFunction(
    { rpcUrl: RPC_URL },
    dao,
    "get_last_proposal_id",
    {},
    z.number().int(),
  );
  const from = Math.max(0, last - count);
  return viewFunction(
    { rpcUrl: RPC_URL },
    dao,
    "get_proposals",
    { from_index: from, limit: count },
    z.array(daoProposal),
  );
}
