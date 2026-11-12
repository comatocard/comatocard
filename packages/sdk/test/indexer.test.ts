import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  approvalsResponse,
  indexedCard,
  paymentDetail,
  paymentPage,
  streamEvent,
  vaultRow,
  vaultSummary,
} from "../src/indexer.js";

// The indexer's own API snapshots, so a change on either side fails here until both agree.
const snapshot = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../apps/indexer/tests/snapshots/${name}`, import.meta.url), "utf8"),
  );

const row = {
  id: 2,
  payment_id: 1,
  vault_id: "alice.factory.comatocard.testnet",
  card_id: 0,
  merchant: "travel.testnet",
  token: "tusd.comatocard.testnet",
  amount: "60000000",
  memo: null,
  reference: null,
  status: "queued",
  queue_cause: "threshold",
  reason: null,
  approver_id: null,
  tx_hash: "tx-pay-1",
  created_at: "1794000104000000000",
  updated_at: "1794000104000000000",
};

describe("indexer responses", () => {
  it("parses the vault list and summary snapshots", () => {
    expect(vaultRow.array().parse(snapshot("vaults_by_owner.json"))).toHaveLength(1);
    const summary = snapshot("vault_summary.json") as Record<string, unknown>;
    expect(vaultSummary.parse({ ...summary, spent_today: "0" }).card_count).toBe(1);
  });

  it("parses the cards and payments snapshots", () => {
    expect(indexedCard.array().parse(snapshot("cards.json"))[0]?.kind).toBe("agent");
    const page = paymentPage.parse(snapshot("payments.json"));
    expect(page.items.map((p) => p.status)).toContain("rejected");
    expect(page.items.find((p) => p.status === "rejected")?.payment_id).toBeNull();
  });

  it("parses approvals, a payment detail and a stream message", () => {
    expect(
      approvalsResponse.parse({
        items: [row],
        approvers: [{ account_id: "council.testnet", max_amount: "100000000" }],
      }).items,
    ).toHaveLength(1);
    const event = {
      event: "payment_queued",
      data: { payment_id: 1 },
      block_height: 10,
      tx_hash: "tx-pay-1",
      timestamp: "1794000104000000000",
    };
    expect(paymentDetail.parse({ ...row, events: [event] }).events[0]?.event).toBe(
      "payment_queued",
    );
    expect(streamEvent.parse({ ...event, contract_id: row.vault_id }).contract_id).toBe(
      row.vault_id,
    );
  });

  it("rejects unknown statuses and extra fields", () => {
    expect(
      paymentPage.safeParse({ items: [{ ...row, status: "lost" }], next_cursor: null }).success,
    ).toBe(false);
    expect(approvalsResponse.safeParse({ items: [], approvers: [], extra: 1 }).success).toBe(false);
  });
});
