import { describe, expect, it, vi } from "vitest";
import type { Quote, SwapStatus } from "../../src/oneclick.js";
import { depositCalls, type ExecuteDeps, executeTopUp } from "../../src/treasury-execute.js";

const config = {
  token: "tusd.comatocard.testnet",
  destinationAsset: "nep141:usdc",
  originAsset: "nep141:wrap.near",
  slippageBps: 100,
  maxSwapUsd: 20,
  account: "treasury.near",
};

const committed: Quote = {
  amountIn: "297986992222975159816605",
  amountInFormatted: "0.298",
  amountInUsd: "1.02",
  minAmountIn: "295007122300745408218438",
  amountOut: "1000000",
  amountOutFormatted: "1.0",
  amountOutUsd: "1.0",
  minAmountOut: "1000000",
  timeEstimate: 22,
  depositAddress: "732dcc01c0036a6876a64fd12a7edc23adf507c66f508e1c7f78ae4e767b2de1",
};

function deps(statuses: SwapStatus[], quote: Quote = committed) {
  const queue = [...statuses];
  return {
    quote: vi.fn(async () => quote),
    send: vi.fn(async () => "Tx1"),
    submit: vi.fn(async () => undefined),
    status: vi.fn(async () => queue.shift() ?? { status: "PROCESSING" as const }),
    sleep: vi.fn(async () => undefined),
  } satisfies ExecuteDeps;
}

const timing = { pollMs: 1_000, timeoutMs: 3_000 };

describe("depositCalls", () => {
  it("registers both accounts, wraps the input and sends it to the deposit address", () => {
    const calls = depositCalls("treasury.near", "abc", 5n);
    expect(calls.map((c) => c.methodName)).toEqual([
      "storage_deposit",
      "storage_deposit",
      "near_deposit",
      "ft_transfer",
    ]);
    expect(calls[0]?.args).toEqual({ account_id: "treasury.near", registration_only: true });
    expect(calls[1]?.args).toEqual({ account_id: "abc", registration_only: true });
    expect(calls[2]?.deposit).toBe(5n);
    expect(calls[3]).toMatchObject({ args: { receiver_id: "abc", amount: "5" }, deposit: 1n });
    expect(calls.reduce((gas, c) => gas + c.gas, 0n)).toBeLessThanOrEqual(300n * 10n ** 12n);
  });
});

describe("executeTopUp", () => {
  it("commits a quote, sends the deposit, submits it and waits for SUCCESS", async () => {
    const d = deps([
      { status: "KNOWN_DEPOSIT_TX" },
      {
        status: "SUCCESS",
        swapDetails: { amountOut: "1000000", destinationChainTxHashes: [{ hash: "Out1" }] },
      },
    ]);
    const execution = await executeTopUp(d, config, 1_000_000n, timing);
    expect(execution).toEqual({
      status: "SUCCESS",
      depositAddress: committed.depositAddress,
      txHash: "Tx1",
      amountIn: committed.amountIn,
      amountOut: "1000000",
      destinationTxHashes: ["Out1"],
      refundReason: null,
    });
    expect(d.quote).toHaveBeenCalledWith(
      expect.objectContaining({ dry: false, amountOut: "1000000" }),
    );
    expect(d.send).toHaveBeenCalledWith(
      depositCalls("treasury.near", committed.depositAddress ?? "", BigInt(committed.amountIn)),
    );
    expect(d.submit).toHaveBeenCalledWith("Tx1", committed.depositAddress);
    expect(d.sleep).toHaveBeenCalledTimes(1);
  });

  it("reports a refund with its reason", async () => {
    const d = deps([{ status: "REFUNDED", swapDetails: { refundReason: "price moved" } }]);
    await expect(executeTopUp(d, config, 1_000_000n, timing)).resolves.toMatchObject({
      status: "REFUNDED",
      refundReason: "price moved",
    });
  });

  it("stops polling after the timeout", async () => {
    const d = deps([]);
    await expect(executeTopUp(d, config, 1_000_000n, timing)).resolves.toMatchObject({
      status: "TIMEOUT",
      txHash: "Tx1",
    });
    expect(d.status).toHaveBeenCalledTimes(4);
  });

  it("sends nothing when the committed quote is refused or unusable", async () => {
    const pricey = deps([], { ...committed, amountInUsd: "25" });
    await expect(executeTopUp(pricey, config, 1_000_000n, timing)).rejects.toThrow(
      "committed quote refused: costs 25 USD, above the 20 USD cap",
    );
    const noAddress: Quote = { ...committed };
    delete noAddress.depositAddress;
    const missing = deps([], noAddress);
    await expect(executeTopUp(missing, config, 1_000_000n, timing)).rejects.toThrow(
      "no deposit address",
    );
    const usdc = deps([]);
    await expect(
      executeTopUp(usdc, { ...config, originAsset: "nep141:usdt.tether-token.near" }, 1n, timing),
    ).rejects.toThrow("origin asset must be nep141:wrap.near");
    for (const d of [pricey, missing, usdc]) expect(d.send).not.toHaveBeenCalled();
  });
});
