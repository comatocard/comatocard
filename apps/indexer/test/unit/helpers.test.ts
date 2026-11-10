import { describe, expect, it, vi } from "vitest";
import { formatUnits, isoFromNanos, toCsv } from "../../src/api/csv.js";
import { decodeCursor, encodeCursor } from "../../src/api/pagination.js";
import { matchesFilter } from "../../src/api/stream.js";
import type { StreamEvent } from "../../src/bus.js";
import { EventBus } from "../../src/bus.js";
import { rpcChainReader } from "../../src/risk/chain.js";
import { tokenDecimalsReader } from "../../src/tokens.js";

describe("csv", () => {
  it("formats timestamps and token units", () => {
    expect(isoFromNanos("1794000000000000000")).toBe("2026-11-06T21:20:00.000Z");
    expect(formatUnits("25000000", 6)).toBe("25");
    expect(formatUnits("1234567", 6)).toBe("1.234567");
    expect(formatUnits("5", 6)).toBe("0.000005");
    expect(formatUnits("42", 0)).toBe("42");
  });

  it("escapes quotes, separators, newlines and formula triggers", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          ["x,y", 'say "hi"'],
          ["=1+1", null],
          ["line\nbreak", 3],
        ],
      ),
    ).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=1+1,\r\n"line\nbreak",3\r\n');
  });
});

describe("pagination", () => {
  it("round-trips cursors and rejects foreign ones", () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
    expect(decodeCursor("garbage")).toBeUndefined();
  });
});

describe("stream", () => {
  const event: StreamEvent = {
    contract_id: "alice.factory.testnet",
    event: "payment_settled",
    data: {
      payment_id: 1,
      card_id: 0,
      merchant: "shop.testnet",
      token: "t.testnet",
      amount: "1",
      reference: null,
    },
    block_height: 1,
    tx_hash: null,
    timestamp: "1",
  };

  it("filters by vault or merchant and sends nothing without a filter", () => {
    expect(matchesFilter(event, { vault: "alice.factory.testnet" })).toBe(true);
    expect(matchesFilter(event, { vault: "bob.factory.testnet" })).toBe(false);
    expect(matchesFilter(event, { merchant: "shop.testnet" })).toBe(true);
    expect(matchesFilter(event, { merchant: "other.testnet" })).toBe(false);
    expect(matchesFilter(event, {})).toBe(false);
  });

  it("fans out and unsubscribes", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    bus.publish(event);
    unsubscribe();
    bus.publish(event);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

const rpc =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("rpcChainReader", () => {
  it("distinguishes contracts, plain accounts, missing accounts and failures", async () => {
    await expect(
      rpcChainReader("https://rpc", rpc({ result: { code_hash: "Abc123" } }))("c.testnet"),
    ).resolves.toEqual({ exists: true, codeHash: "Abc123" });
    await expect(
      rpcChainReader(
        "https://rpc",
        rpc({ result: { code_hash: "11111111111111111111111111111111" } }),
      )("a.testnet"),
    ).resolves.toEqual({ exists: true, codeHash: null });
    await expect(
      rpcChainReader(
        "https://rpc",
        rpc({ error: { cause: { name: "UNKNOWN_ACCOUNT" } } }),
      )("x.testnet"),
    ).resolves.toEqual({ exists: false, codeHash: null });
    await expect(rpcChainReader("https://rpc", rpc({}, 502))("x.testnet")).resolves.toBeNull();
    await expect(
      rpcChainReader("https://rpc", rpc({ error: {} }))("x.testnet"),
    ).resolves.toBeNull();
    await expect(
      rpcChainReader("https://rpc", async () => {
        throw new Error("down");
      })("x.testnet"),
    ).resolves.toBeNull();
  });
});

describe("tokenDecimalsReader", () => {
  it("caches successful lookups and retries failed ones", async () => {
    const bytes = [...new TextEncoder().encode(JSON.stringify({ decimals: 6, symbol: "tUSD" }))];
    const ok = vi.fn(async () => new Response(JSON.stringify({ result: { result: bytes } })));
    const read = tokenDecimalsReader("https://rpc", ok);
    await expect(read("t.testnet")).resolves.toBe(6);
    await expect(read("t.testnet")).resolves.toBe(6);
    expect(ok).toHaveBeenCalledTimes(1);

    const failing = vi.fn(async () => new Response("{}", { status: 500 }));
    const readFailing = tokenDecimalsReader("https://rpc", failing);
    await expect(readFailing("t.testnet")).resolves.toBeUndefined();
    await expect(readFailing("t.testnet")).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
