import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus, type StreamEvent } from "../../src/bus.js";
import type { Database } from "../../src/db/client.js";
import * as schema from "../../src/db/schema.js";
import { indexBlock, type RunnerState, run, storedHeight } from "../../src/ingest/runner.js";
import { createLogger } from "../../src/logger.js";
import { trackedAccounts } from "../../src/neardata/extract.js";
import { FACTORY, fixtureSource, REGISTRY, scenario, VAULT } from "../support/blocks.js";
import { createTestDb } from "../support/db.js";

const isTracked = trackedAccounts(FACTORY, REGISTRY);
const logger = createLogger("silent");

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => close());

async function indexScenario() {
  for (const block of scenario()) {
    await indexBlock({ db, isTracked }, block.block.header.height, block);
  }
}

describe("indexBlock", () => {
  it("projects the scenario into vaults, cards, payments and the registry", async () => {
    await indexScenario();
    const vaults = await db.select().from(schema.vaults);
    expect(vaults).toEqual([
      expect.objectContaining({ vaultId: VAULT, ownerId: "alice.testnet", factoryId: FACTORY }),
    ]);
    const cards = await db.select().from(schema.cards);
    expect(cards).toEqual([expect.objectContaining({ cardId: 0, status: "active" })]);
    const payments = await db.select().from(schema.payments).orderBy(schema.payments.id);
    expect(payments.map((p) => [p.paymentId, p.merchant, p.status, p.reason])).toEqual([
      [0, "shop.testnet", "settled", null],
      [1, "travel.testnet", "settled", null],
      [null, "shop.testnet", "rejected", "per_tx_limit"],
      [2, "scam.testnet", "failed", "merchant_blocked"],
    ]);
    expect(payments.find((p) => p.paymentId === 1)).toMatchObject({
      approverId: "council.testnet",
      queueCause: "threshold",
    });
    const statuses = await db.select().from(schema.registryStatuses);
    expect(statuses).toEqual([
      expect.objectContaining({ accountId: "scam.testnet", status: "blocked", reportIds: [0] }),
    ]);
  });

  it("ignores failed receipts and other contracts, and dead-letters invalid events", async () => {
    await indexScenario();
    const events = await db.select().from(schema.events);
    expect(
      events.every(
        (e) => e.contractId === VAULT || e.contractId === FACTORY || e.contractId === REGISTRY,
      ),
    ).toBe(true);
    expect(events.some((e) => JSON.stringify(e.data).includes("ghost.testnet"))).toBe(false);
    const dead = await db.select().from(schema.deadLetters);
    expect(dead).toHaveLength(1);
    expect(dead[0]?.error).toContain("payment_settled");
  });

  it("is idempotent when a block is processed twice", async () => {
    await indexScenario();
    const [first] = scenario();
    if (!first) throw new Error("empty scenario");
    const replay = await indexBlock({ db, isTracked }, 100, first);
    expect(replay.result).toMatchObject({ indexed: 0, duplicates: 1 });
    for (const block of scenario()) {
      await indexBlock({ db, isTracked }, block.block.header.height, block);
    }
    expect(await db.select().from(schema.payments)).toHaveLength(4);
    expect(await db.select().from(schema.tokenFlows)).toHaveLength(1);
  });

  it("advances the cursor on empty heights", async () => {
    const { result } = await indexBlock({ db, isTracked }, 500, null);
    expect(result).toEqual({ height: 500, indexed: 0, duplicates: 0, deadLetters: 0 });
    expect(await storedHeight(db)).toBe(500);
  });

  it("applies card, approver and owner lifecycle events", async () => {
    await indexScenario();
    const { eventLine, makeBlock } = await import("../support/blocks.js");
    await indexBlock(
      { db, isTracked },
      200,
      makeBlock(200, [
        {
          executor: VAULT,
          logs: [
            eventLine("card_frozen", { card_id: 0 }),
            eventLine("card_key_rotated", {
              card_id: 0,
              old_public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp",
              new_public_key: "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847",
            }),
            eventLine("approver_set", { account_id: "council.testnet", max_amount: null }),
            eventLine("owner_proposed", { owner_id: "dao.sputnik-v2.testnet" }),
            eventLine("owner_changed", { owner_id: "dao.sputnik-v2.testnet" }),
            eventLine("withdrawal", {
              token: "tusd.comatocard.testnet",
              receiver_id: "alice.testnet",
              amount: "5",
              success: false,
            }),
          ],
        },
      ]),
    );
    const [card] = await db.select().from(schema.cards);
    expect(card).toMatchObject({
      status: "frozen",
      publicKey: "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847",
    });
    expect(await db.select().from(schema.approvers)).toEqual([]);
    const [vault] = await db.select().from(schema.vaults);
    expect(vault).toMatchObject({ ownerId: "dao.sputnik-v2.testnet", pendingOwnerId: null });
    const flows = await db.select().from(schema.tokenFlows);
    expect(flows.map((f) => [f.kind, f.success])).toEqual([
      ["deposit", true],
      ["withdrawal", false],
    ]);
  });
});

describe("run", () => {
  it("follows the source from the start block and publishes committed events", async () => {
    const source = fixtureSource(scenario());
    const bus = new EventBus();
    const published: StreamEvent[] = [];
    bus.subscribe((event) => published.push(event));
    const state: RunnerState = { indexedHeight: undefined, chainHeight: undefined };
    const controller = new AbortController();
    const done = run(
      { db, source, bus, logger, isTracked, startBlock: 100, pollIntervalMs: 5 },
      state,
      controller.signal,
    );
    await expect.poll(() => state.indexedHeight, { timeout: 5_000 }).toBe(108);
    controller.abort();
    await done;
    expect(source.requests.slice(0, 9)).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108]);
    expect(published.map((e) => e.event)).toContain("payment_settled");
    expect(state.chainHeight).toBe(108);
  });

  it("resumes after the stored cursor", async () => {
    await indexBlock({ db, isTracked }, 104, null);
    const source = fixtureSource(scenario());
    const state: RunnerState = { indexedHeight: undefined, chainHeight: undefined };
    const controller = new AbortController();
    const done = run(
      { db, source, bus: new EventBus(), logger, isTracked, pollIntervalMs: 5 },
      state,
      controller.signal,
    );
    await expect.poll(() => state.indexedHeight, { timeout: 5_000 }).toBe(108);
    controller.abort();
    await done;
    expect(source.requests[0]).toBe(105);
  });

  it("keeps running after a source failure", async () => {
    const source = fixtureSource(scenario());
    let failures = 1;
    const flaky = {
      ...source,
      block: async (height: number) => {
        if (failures-- > 0) throw new Error("temporary");
        return source.block(height);
      },
    };
    const state: RunnerState = { indexedHeight: undefined, chainHeight: undefined };
    const controller = new AbortController();
    const done = run(
      {
        db,
        source: flaky,
        bus: new EventBus(),
        logger,
        isTracked,
        startBlock: 100,
        pollIntervalMs: 5,
      },
      state,
      controller.signal,
    );
    await expect.poll(() => state.indexedHeight, { timeout: 5_000 }).toBe(108);
    controller.abort();
    await done;
  });
});
