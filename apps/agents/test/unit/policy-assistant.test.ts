import { type Card, OWNER_CALL_GAS } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import { type Chat, extractJson, proposePolicy } from "../../src/policy-assistant.js";
import type { Verification } from "../../src/private-chat.js";

const verification = { verified: true } as Verification;
const policy = {
  token: "tusd.comatocard.testnet",
  per_tx_limit: "20000000",
  daily_limit: "50000000",
  monthly_limit: "200000000",
  approval_threshold: "10000000",
  merchants: "any",
  valid_from: null,
  expires_at: null,
  risk_mode: "block_only",
} as const;
const card = { id: 0, label: "spending agent", policy } as unknown as Card;
const answering =
  (content: string): Chat =>
  async () => ({ content, verification });
const propose = (content: string) =>
  proposePolicy({ chat: answering(content), vaultId: "v.testnet" }, card, "x");

describe("proposePolicy", () => {
  it("turns a valid answer into an update_policy call and lists the changes", async () => {
    const answer = `<think>raise {daily}</think>\n\`\`\`json\n${JSON.stringify({ ...policy, daily_limit: "80000000", merchants: { allow: ["shop.testnet"] } })}\n\`\`\``;
    const proposal = await propose(answer);
    expect(proposal).toMatchObject({ kind: "proposal", changed: ["daily_limit", "merchants"] });
    if (proposal.kind !== "proposal") return;
    expect(proposal.call).toEqual({
      receiverId: "v.testnet",
      methodName: "update_policy",
      args: { card_id: 0, policy: proposal.proposed },
      gas: OWNER_CALL_GAS,
      deposit: "0",
    });
  });

  it("refuses answers that are not a valid policy, change the token or break the limit order", async () => {
    expect(await propose("I cannot help")).toMatchObject({
      kind: "invalid",
      reason: "the answer holds no JSON object",
    });
    expect(await propose(JSON.stringify({ ...policy, risk_mode: "yolo" }))).toMatchObject({
      kind: "invalid",
    });
    expect(await propose(JSON.stringify({ ...policy, token: "usdc.testnet" }))).toMatchObject({
      reason: "the assistant may not change the card token",
    });
    expect(await propose(JSON.stringify({ ...policy, per_tx_limit: "90000000" }))).toMatchObject({
      reason: "per_tx_limit <= daily_limit <= monthly_limit does not hold",
    });
  });
});

describe("extractJson", () => {
  it("finds the first object, skipping braces in strings and broken JSON", () => {
    expect(extractJson('note: {"a":"}{","b":{"c":1}} trailing')).toEqual({ a: "}{", b: { c: 1 } });
    expect(extractJson('{"a": 1')).toBeUndefined();
    expect(extractJson("{not json}")).toBeUndefined();
  });
});
