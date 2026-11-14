import type { Card, TokenBalance, YieldView } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import { type KeeperConfig, planLending } from "../../src/keeper.js";

const DAY = 86_400n * 1_000_000_000n;
const NOW = 20_400n * DAY + 5n; // day 20400, period 680
const TOKEN = "usdc.fakes.testnet";
const config: KeeperConfig = { token: TOKEN, bufferBps: 15_000, minMove: 1_000_000n };

// One card that may still spend 40 today (daily 50, spent 10).
const cards: Card[] = [
  {
    id: 0,
    label: "agent",
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
    spend: { day: 20_400, day_spent: "10000000", period: 680, period_spent: "10000000" },
    created_at: "0",
  },
];

const balances = (available: string): TokenBalance[] => [
  { token: TOKEN, accepted: true, available, reserved: "0" },
];

function lending(
  overrides: Partial<YieldView["tokens"][number]> = {},
  venue: string | null = "burrow.testnet",
): YieldView {
  return {
    venue,
    keeper: "keeper.testnet",
    tokens: [
      {
        token: TOKEN,
        min_liquid: "30000000",
        supplied: "0",
        pending: false,
        ...overrides,
      },
    ],
  };
}

const plan = (available: string, l: YieldView = lending()) =>
  planLending({ cards, balances: balances(available), lending: l, nowNs: NOW }, config);

describe("planLending", () => {
  it("lends what is above 1.5 times the cards' spend room", () => {
    // Target 60 (40 x 1.5, above min_liquid 30); 100 available, so 40 goes to the venue.
    expect(plan("100000000")).toEqual({
      action: "supply",
      amount: "40000000",
      target: "60000000",
      available: "100000000",
      supplied: "0",
    });
  });

  it("keeps min_liquid when it is above the cards' needs", () => {
    const idle = planLending(
      { cards: [], balances: balances("100000000"), lending: lending(), nowNs: NOW },
      config,
    );
    expect(idle).toMatchObject({ action: "supply", amount: "70000000", target: "30000000" });
  });

  it("recalls the shortfall when cards need more than is available", () => {
    expect(plan("20000000", lending({ supplied: "80000000" }))).toMatchObject({
      action: "recall",
      amount: "40000000",
    });
  });

  it("holds while an operation is in flight, without a venue, or for a dust surplus", () => {
    expect(plan("100000000", lending({ pending: true }))).toMatchObject({ action: "hold" });
    expect(plan("100000000", lending({}, null))).toMatchObject({
      reason: "no lending venue is set",
    });
    expect(plan("60500000")).toMatchObject({ reason: "surplus below the minimum move" });
    expect(plan("20000000")).toMatchObject({ reason: "available matches the target" });
  });
});
