import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractLogs, trackedAccounts } from "../../src/neardata/extract.js";
import { blockSchema } from "../../src/neardata/types.js";
import { FACTORY, makeBlock, REGISTRY, VAULT } from "../support/blocks.js";

const isTracked = trackedAccounts(FACTORY, REGISTRY);

describe("trackedAccounts", () => {
  it("accepts the factory, the registry and direct factory sub-accounts", () => {
    expect(isTracked(FACTORY)).toBe(true);
    expect(isTracked(REGISTRY)).toBe(true);
    expect(isTracked(VAULT)).toBe(true);
    expect(isTracked(`deep.${VAULT}`)).toBe(false);
    expect(isTracked(`evil${FACTORY}`)).toBe(false);
    expect(isTracked("other.testnet")).toBe(false);
  });

  it("works without a registry", () => {
    const tracked = trackedAccounts(FACTORY, undefined);
    expect(tracked(REGISTRY)).toBe(false);
    expect(tracked(VAULT)).toBe(true);
  });
});

describe("extractLogs", () => {
  it("parses a real neardata testnet block", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../fixtures/neardata-testnet-block.json", import.meta.url), "utf8"),
    );
    const block = blockSchema.parse(raw);
    const everything = extractLogs(block, () => true);
    expect(block.block.header.height).toBe(277005108);
    expect(everything.every((log) => log.blockHeight === 277005108)).toBe(true);
    expect(extractLogs(block, isTracked)).toEqual([]);
  });

  it("keeps successful tracked receipts in order with their positions", () => {
    const block = makeBlock(7, [
      { executor: VAULT, logs: ["a", "b"], receiptId: "r1", txHash: "t1" },
      { executor: VAULT, logs: ["dropped"], failed: true },
      { executor: "other.testnet", logs: ["ignored"] },
      { executor: FACTORY, logs: ["c"], receiptId: "r2" },
    ]);
    expect(extractLogs(block, isTracked)).toMatchObject([
      { receiptId: "r1", logIndex: 0, line: "a", txHash: "t1", executorId: VAULT },
      { receiptId: "r1", logIndex: 1, line: "b" },
      { receiptId: "r2", logIndex: 0, line: "c", executorId: FACTORY },
    ]);
  });

  it("treats a receipt id result as success and tolerates empty shards", () => {
    const block = makeBlock(8, [{ executor: VAULT, logs: ["x"] }]);
    const outcome = block.shards[0]?.receipt_execution_outcomes?.[0]?.execution_outcome.outcome;
    if (outcome) outcome.status = { SuccessReceiptId: "abc" };
    block.shards.push({ shard_id: 1, receipt_execution_outcomes: null });
    expect(extractLogs(block, isTracked)).toHaveLength(1);
  });
});
