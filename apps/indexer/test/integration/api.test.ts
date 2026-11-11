import { riskAssessment } from "@comatocard/sdk";
import { serve, upgradeWebSocket, type WebSocketServerLike } from "@hono/node-server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createApp } from "../../src/api/app.js";
import { EventBus } from "../../src/bus.js";
import type { Database } from "../../src/db/client.js";
import { indexBlock, type RunnerState } from "../../src/ingest/runner.js";
import { trackedAccounts } from "../../src/neardata/extract.js";
import type { ChainReader } from "../../src/risk/chain.js";
import { riskService } from "../../src/risk/service.js";
import { FACTORY, REGISTRY, scenario, timestampOf, VAULT } from "../support/blocks.js";
import { createTestDb } from "../support/db.js";

const NOW = BigInt(timestampOf(200));
let db: Database;
let close: () => Promise<void>;
let codeHash: string | null;
const chain: ChainReader = async (account) =>
  account === "missing.testnet" ? { exists: false, codeHash: null } : { exists: true, codeHash };

function buildApp(bus = new EventBus()) {
  const state: RunnerState = { indexedHeight: 108, chainHeight: 110 };
  return createApp({
    db,
    state,
    bus,
    risk: riskService({ db, chain, registryId: REGISTRY, now: () => NOW }),
    tokenDecimals: async (token) => (token.startsWith("tusd") ? 6 : undefined),
    upgradeWebSocket,
  });
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  codeHash = null;
  const isTracked = trackedAccounts(FACTORY, REGISTRY);
  for (const block of scenario()) {
    await indexBlock({ db, isTracked }, block.block.header.height, block);
  }
});
afterEach(async () => close());

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally per test.
type Json = any;

const get = async (path: string): Promise<{ status: number; body: Json }> => {
  const response = await buildApp().request(path);
  return { status: response.status, body: await response.json() };
};

describe("REST API", () => {
  it("reports health and lag", async () => {
    expect(await get("/health")).toEqual({
      status: 200,
      body: { status: "ok", indexed_height: 108, chain_height: 110, lag: 2 },
    });
  });

  it("lists vaults by owner and summarizes a vault", async () => {
    expect((await get("/vaults?owner=alice.testnet")).body).toMatchSnapshot();
    const summary = await get(`/vaults/${VAULT}`);
    expect({ ...summary.body, spent_today: "<time dependent>" }).toMatchSnapshot();
    expect((await get("/vaults/nobody.factory.comatocard.testnet")).status).toBe(404);
  });

  it("serves cards and one card with its recent payments", async () => {
    expect((await get(`/vaults/${VAULT}/cards`)).body).toMatchSnapshot();
    const card = await get(`/vaults/${VAULT}/cards/0`);
    expect(card.body.recent_payments).toHaveLength(4);
    expect((await get(`/vaults/${VAULT}/cards/9`)).status).toBe(404);
  });

  it("finds cards by token holder", async () => {
    const held = await get("/cards?holder=alice.testnet");
    expect(held.body.map((c: { card_id: number }) => c.card_id)).toEqual([0]);
    expect((await get("/cards?holder=agent.testnet")).body).toEqual([]);
    expect((await get("/cards")).status).toBe(400);
  });

  it("filters and paginates payments", async () => {
    const all = await get(`/vaults/${VAULT}/payments`);
    expect(all.body).toMatchSnapshot();
    const rejected = await get(`/vaults/${VAULT}/payments?status=rejected`);
    expect(rejected.body.items.map((p: { reason: string }) => p.reason)).toEqual(["per_tx_limit"]);
    const first = await get(`/vaults/${VAULT}/payments?limit=3`);
    expect(first.body.items).toHaveLength(3);
    const next = await get(`/vaults/${VAULT}/payments?limit=3&cursor=${first.body.next_cursor}`);
    expect(next.body).toMatchObject({ next_cursor: null });
    expect(next.body.items).toHaveLength(1);
    expect(
      (await get(`/vaults/${VAULT}/payments?merchant=travel.testnet`)).body.items,
    ).toHaveLength(1);
    expect((await get(`/vaults/${VAULT}/payments?cursor=bogus`)).status).toBe(400);
    expect((await get(`/vaults/${VAULT}/payments?status=lost`)).status).toBe(400);
  });

  it("returns a payment with its event history", async () => {
    const payment = await get(`/vaults/${VAULT}/payments/1`);
    expect(payment.body.events.map((e: { event: string }) => e.event)).toEqual([
      "payment_queued",
      "payment_approved",
      "payment_settled",
    ]);
    expect((await get(`/vaults/${VAULT}/payments/99`)).status).toBe(404);
  });

  it("lists approvals and approvers", async () => {
    expect((await get(`/vaults/${VAULT}/approvals`)).body).toEqual({
      items: [],
      approvers: [{ account_id: "council.testnet", max_amount: "80000000" }],
    });
  });

  it("exports an accountant friendly CSV", async () => {
    const response = await buildApp().request(`/vaults/${VAULT}/export.csv`);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(await response.text()).toMatchSnapshot();
  });

  it("aggregates analytics", async () => {
    expect((await get(`/analytics/${VAULT}`)).body).toMatchSnapshot();
  });

  it("finds merchant payments by reference", async () => {
    const found = await get("/merchants/shop.testnet/payments?reference=inv-1");
    expect(found.body.map((p: { status: string }) => p.status)).toEqual(["settled"]);
  });

  it("assesses counterparty risk", async () => {
    const scam = (await get(`/risk/scam.testnet?vault=${VAULT}`)).body;
    expect(scam).toMatchSnapshot();
    const shop = (await get(`/risk/shop.testnet?vault=${VAULT}`)).body;
    expect(shop.verdict).toBe("allow");
    const missing = (await get("/risk/missing.testnet")).body;
    expect(missing.verdict).toBe("warn");
    // Agents parse this response with the SDK schema.
    for (const body of [scam, shop, missing]) riskAssessment.parse(body);
  });

  it("warns when a contract's code changes after it was first observed", async () => {
    codeHash = "CodeV1";
    expect((await get("/risk/shop.testnet")).body.verdict).toBe("allow");
    codeHash = "CodeV2";
    const changed = await get("/risk/shop.testnet");
    expect(changed.body.verdict).toBe("warn");
    expect(changed.body.reasons.map((r: { code: string }) => r.code)).toContain(
      "code_changed_recently",
    );
  });

  it("rejects invalid input and unknown routes", async () => {
    expect((await get("/vaults")).status).toBe(400);
    expect((await get("/risk/NOT%20VALID")).status).toBe(400);
    expect((await get("/nope")).status).toBe(404);
  });
});

describe("WebSocket stream", () => {
  it("pushes matching events to subscribers", async () => {
    const bus = new EventBus();
    const app = buildApp(bus);
    const server = serve({
      fetch: app.fetch,
      port: 0,
      websocket: {
        server: new WebSocketServer({ noServer: true }) as unknown as WebSocketServerLike,
      },
    });
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/stream?vault=${VAULT}`);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve);
      socket.addEventListener("error", reject);
    });
    const received = new Promise<string>((resolve) =>
      socket.addEventListener("message", (m) => resolve(String(m.data))),
    );
    const base = { block_height: 1, tx_hash: null, timestamp: "1" };
    bus.publish({
      ...base,
      contract_id: "other.testnet",
      event: "payment_expired",
      data: { payment_id: 9 },
    });
    bus.publish({ ...base, contract_id: VAULT, event: "payment_expired", data: { payment_id: 4 } });
    expect(JSON.parse(await received)).toMatchObject({
      contract_id: VAULT,
      data: { payment_id: 4 },
    });
    socket.close();
    await new Promise((resolve) => server.close(resolve));
  });
});
