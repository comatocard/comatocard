import type { Card, TokenBalance } from "@comatocard/sdk";
import { describe, expect, it, vi } from "vitest";
import type { Quote, QuoteRequest } from "../../src/oneclick.js";
import { cardBuffers, planTreasury } from "../../src/treasury.js";

const DAY = 86_400n * 1_000_000_000n;
const NOW = 20_400n * DAY + 5n; // day 20400, period 680
const TOKEN = "tusd.comatocard.testnet";

function card(id: number, overrides: Partial<Card> = {}, spend: Partial<Card["spend"]> = {}): Card {
  return {
    id,
    label: `card ${id}`,
    kind: "agent",
    public_key: null,
    holder: null,
    status: "active",
    policy: {
      token: TOKEN,
      per_tx_limit: "20000000",
      daily_limit: "50000000",
      monthly_limit: "200000000",
      approval_threshold: null,
      merchants: "any",
      valid_from: null,
      expires_at: null,
      risk_mode: "block_only",
    },
    spend: { day: 20_400, day_spent: "10000000", period: 680, period_spent: "10000000", ...spend },
    created_at: "0",
    ...overrides,
  } as Card;
}

describe("cardBuffers", () => {
  it("is the day room of active cards in the token", () => {
    const cards = [
      card(0),
      card(1, { status: "frozen" }),
      card(2, { policy: { ...card(0).policy, token: "usdc.testnet" } }),
    ];
    expect(cardBuffers(cards, TOKEN, NOW)).toEqual([
      { cardId: 0, label: "card 0", buffer: 40_000_000n },
    ]);
  });

  it("resets stale counters like the vault and caps by the period room", () => {
    expect(cardBuffers([card(0, {}, { day: 20_399 })], TOKEN, NOW)[0]?.buffer).toBe(50_000_000n);
    const nearlySpent = card(0, {}, { day: 20_399, period_spent: "195000000" });
    expect(cardBuffers([nearlySpent], TOKEN, NOW)[0]?.buffer).toBe(5_000_000n);
    const over = card(0, {}, { day_spent: "60000000" });
    expect(cardBuffers([over], TOKEN, NOW)[0]?.buffer).toBe(0n);
  });
});

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  amountIn: "1",
  amountInFormatted: "1",
  amountInUsd: "15.2",
  minAmountIn: "1",
  amountOut: "15000000",
  amountOutFormatted: "15",
  amountOutUsd: "14.99",
  minAmountOut: "15000000",
  timeEstimate: 20,
  ...overrides,
});

function deps(available: string, q: Quote = quote()) {
  const balances: TokenBalance[] = [{ token: TOKEN, accepted: true, available, reserved: "0" }];
  return {
    cards: async () => [card(0)],
    balances: async () => balances,
    quote: vi.fn(async (_r: QuoteRequest) => q),
    nowNs: () => NOW,
  };
}

const config = {
  token: TOKEN,
  destinationAsset: "nep141:usdc",
  originAsset: "nep141:wrap.near",
  slippageBps: 100,
  maxSwapUsd: 20,
  account: "treasury.near",
};

describe("planTreasury", () => {
  it("plans nothing and quotes nothing when the vault covers every card", async () => {
    const d = deps("40000000");
    expect(await planTreasury(d, config)).toMatchObject({ action: "none", required: "40000000" });
    expect(d.quote).not.toHaveBeenCalled();
  });

  it("quotes the exact deficit as a dry run with the slippage limit", async () => {
    const d = deps("25000000");
    const plan = await planTreasury(d, config);
    expect(plan).toMatchObject({ action: "top_up", deficit: "15000000", slippageBps: 100 });
    expect(d.quote).toHaveBeenCalledWith({
      originAsset: "nep141:wrap.near",
      destinationAsset: "nep141:usdc",
      amountOut: "15000000",
      slippageBps: 100,
      account: "treasury.near",
      dry: true,
    });
  });

  it("refuses a quote above the USD cap or below the deficit", async () => {
    expect(
      await planTreasury(deps("25000000", quote({ amountInUsd: "25.1" })), config),
    ).toMatchObject({
      action: "refused",
      reason: "costs 25.1 USD, above the 20 USD cap",
    });
    expect(
      await planTreasury(deps("25000000", quote({ minAmountOut: "14000000" })), config),
    ).toMatchObject({
      action: "refused",
      reason: "quote does not guarantee the deficit",
    });
  });
});
