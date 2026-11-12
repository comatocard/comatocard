import { describe, expect, it } from "vitest";
import {
  actProposalCall,
  addProposalCall,
  type DaoProposal,
  decisionKind,
  isCouncil,
  proposalDecision,
} from "../src/lib/dao";

const vault = "acme.factory.comatocard.testnet";

const proposal = (kind: unknown): DaoProposal => ({
  id: 7,
  proposer: "council.testnet",
  description: "",
  kind,
  status: "InProgress",
  submission_time: "1794000000000000000",
});

describe("DAO proposals", () => {
  it("builds the FunctionCall kind the sandbox test uses", () => {
    const kind = decisionKind(vault, "approve_payment", 3);
    expect(kind.FunctionCall.receiver_id).toBe(vault);
    expect(kind.FunctionCall.actions[0]).toEqual({
      method_name: "approve_payment",
      args: btoa(JSON.stringify({ payment_id: 3 })),
      deposit: "0",
      gas: "150000000000000",
    });
  });

  it("reads back which payment a proposal decides, and ignores others", () => {
    expect(proposalDecision(proposal(decisionKind(vault, "decline_payment", 9)), vault)).toEqual({
      method: "decline_payment",
      paymentId: 9,
    });
    expect(
      proposalDecision(proposal(decisionKind("other.testnet", "approve_payment", 9)), vault),
    ).toBeNull();
    expect(proposalDecision(proposal({ Transfer: { amount: "1" } }), vault)).toBeNull();
  });

  it("attaches the bond to add_proposal and repeats the kind in act_proposal", () => {
    const add = addProposalCall(
      "council.sputnik-v2.testnet",
      "1000000000000000000000000",
      vault,
      "approve_payment",
      3,
    );
    expect(add.deposit).toBe("1000000000000000000000000");
    const p = proposal(decisionKind(vault, "approve_payment", 3));
    expect(actProposalCall("council.sputnik-v2.testnet", p, "VoteApprove").args).toEqual({
      id: 7,
      action: "VoteApprove",
      proposal: p.kind,
    });
  });

  it("finds council members by group and vote permission", () => {
    const policy = {
      proposal_bond: "1",
      roles: [
        { name: "all", kind: "Everyone" as const, permissions: ["*:AddProposal"] },
        { name: "council", kind: { Group: ["a.testnet"] }, permissions: ["*:*"] },
      ],
    };
    expect(isCouncil(policy, "a.testnet")).toBe(true);
    expect(isCouncil(policy, "b.testnet")).toBe(false);
  });
});
