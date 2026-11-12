import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Recorded, startUpstream } from "./upstream";

// The route handlers run in-process against real HTTP servers standing in for the indexer, the
// relayer and the NEAR RPC. Configuration is read at import, so env is set before importing.

const MERCHANT = "comatocard-shop.testnet";
const TOKEN = "tusd.comatocard.testnet";
let paidReference = "";

const settledRow = (reference: string) => ({
  id: 9,
  payment_id: 4,
  vault_id: "acme.factory.comatocard.testnet",
  card_id: 0,
  merchant: MERCHANT,
  token: TOKEN,
  amount: "1000000",
  memo: null,
  reference,
  status: "settled",
  queue_cause: null,
  reason: null,
  approver_id: null,
  tx_hash: "tx-shop",
  created_at: "1794000000000000000",
  updated_at: "1794000001000000000",
});

const indexer = await startUpstream((req: Recorded) => {
  if (req.url.startsWith(`/merchants/${MERCHANT}/payments`)) {
    const reference = new URL(req.url, "https://app.test").searchParams.get("reference") ?? "";
    return { status: 200, body: reference === paidReference ? [settledRow(reference)] : [] };
  }
  if (req.url.startsWith("/vaults?owner=")) return { status: 200, body: [] };
  return { status: 404, body: { error: "not found" } };
});
const relayer = await startUpstream(() => ({
  status: 200,
  body: { status: "relayed", tx_hash: "tx-relayed", failure: null },
}));
const rpc = await startUpstream((req) => {
  const { method } = JSON.parse(req.body) as { method: string };
  if (method === "gas_price") return { status: 200, body: { result: { gas_price: "100000000" } } };
  return { status: 200, body: { result: { header: { height: 42, timestamp_nanosec: "1" } } } };
});

vi.stubEnv("INDEXER_URL", indexer.url);
vi.stubEnv("RELAYER_URL", relayer.url);
vi.stubEnv("NEXT_PUBLIC_RPC_URL", rpc.url);

const indexerRoute = await import("../../src/app/api/indexer/[...path]/route");
const relayRoute = await import("../../src/app/api/relay/route");
const shopRoute = await import("../../src/app/api/shop/report/route");

const params = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });

afterAll(async () => {
  await Promise.all([indexer.close(), relayer.close(), rpc.close()]);
});

describe("indexer proxy", () => {
  beforeAll(() => {
    indexer.requests.length = 0;
  });

  it("forwards an allowed read with its query", async () => {
    const response = await indexerRoute.GET(
      new Request("https://app.test/api/indexer/vaults?owner=alice.testnet"),
      params("vaults"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(indexer.requests.at(-1)?.url).toBe("/vaults?owner=alice.testnet");
  });

  it("refuses paths outside the read API without calling the indexer", async () => {
    const before = indexer.requests.length;
    const response = await indexerRoute.GET(
      new Request("https://app.test/api/indexer/admin"),
      params("admin"),
    );
    expect(response.status).toBe(404);
    expect(indexer.requests).toHaveLength(before);
  });
});

describe("relayer proxy", () => {
  it("refuses a body that is not a signed delegate", async () => {
    const response = await relayRoute.POST(
      new Request("https://app.test/api/relay", {
        method: "POST",
        body: JSON.stringify({ nope: 1 }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "refused", reason: "malformed" });
    expect(relayer.requests).toHaveLength(0);
  });

  it("forwards a signed delegate and returns the relayer's answer", async () => {
    const response = await relayRoute.POST(
      new Request("https://app.test/api/relay", {
        method: "POST",
        body: JSON.stringify({ signed_delegate: "AAEC" }),
      }),
    );
    expect(await response.json()).toEqual({
      status: "relayed",
      tx_hash: "tx-relayed",
      failure: null,
    });
    expect(JSON.parse(relayer.requests.at(-1)?.body ?? "{}")).toEqual({ signed_delegate: "AAEC" });
  });
});

describe("HTTP 402 merchant", () => {
  it("answers 402 with a fresh challenge, then serves the resource once it is paid", async () => {
    const first = await shopRoute.GET(new Request("https://app.test/api/shop/report"));
    expect(first.status).toBe(402);
    const challenge = (await first.json()) as {
      reference: string;
      merchant: string;
      amount: string;
    };
    expect(challenge).toMatchObject({ merchant: MERCHANT, amount: "1000000" });

    const unpaid = await shopRoute.GET(
      new Request(`https://app.test/api/shop/report?reference=${challenge.reference}`),
    );
    expect(unpaid.status).toBe(402);

    paidReference = challenge.reference;
    const paid = await shopRoute.GET(
      new Request(`https://app.test/api/shop/report?reference=${challenge.reference}`),
    );
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({
      gas_price_yocto: "100000000",
      block_height: 42,
      receipt: { reference: challenge.reference, tx_hash: "tx-shop" },
    });

    const replay = await shopRoute.GET(
      new Request(`https://app.test/api/shop/report?reference=${challenge.reference}`),
    );
    expect(replay.status).toBe(409);
  });

  it("refuses references it did not issue", async () => {
    const response = await shopRoute.GET(
      new Request("https://app.test/api/shop/report?reference=inv-1"),
    );
    expect(response.status).toBe(402);
    expect(((await response.json()) as { reference: string }).reference).not.toBe("inv-1");
  });
});
