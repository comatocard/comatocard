import type { Card, TokenBalance } from "@comatocard/sdk";
import type { Quote, QuoteRequest } from "./oneclick.js";

/** Same windows as the vault (`contracts/vault/src/policy.rs`). */
const DAY_NS = 86_400n * 1_000_000_000n;
const PERIOD_NS = 30n * DAY_NS;

export interface CardBuffer {
  cardId: number;
  label: string;
  /** What the card may still spend today, capped by what is left of its period limit. */
  buffer: bigint;
}

/** Spend room of every active card in `token` at `nowNs`, resetting stale counters like the vault. */
export function cardBuffers(cards: Card[], token: string, nowNs: bigint): CardBuffer[] {
  const day = nowNs / DAY_NS;
  const period = nowNs / PERIOD_NS;
  return cards
    .filter((c) => c.status === "active" && c.policy.token === token)
    .map((c) => {
      const daySpent = BigInt(c.spend.day) === day ? BigInt(c.spend.day_spent) : 0n;
      const periodSpent = BigInt(c.spend.period) === period ? BigInt(c.spend.period_spent) : 0n;
      const dayRoom = clamp(BigInt(c.policy.daily_limit) - daySpent);
      const periodRoom = clamp(BigInt(c.policy.monthly_limit) - periodSpent);
      return { cardId: c.id, label: c.label, buffer: smaller(dayRoom, periodRoom) };
    });
}

const clamp = (value: bigint) => (value > 0n ? value : 0n);
// Math.min does not take bigint.
const smaller = (a: bigint, b: bigint) => (b < a ? b : a);

export interface TreasuryConfig {
  token: string;
  /** Mainnet asset quoted for the token, for example USDC for tUSD on testnet. */
  destinationAsset: string;
  originAsset: string;
  slippageBps: number;
  maxSwapUsd: number;
  account: string;
}

export type TreasuryPlan =
  | { action: "none"; token: string; required: string; available: string; cards: PlanCard[] }
  | {
      action: "top_up" | "refused";
      token: string;
      required: string;
      available: string;
      deficit: string;
      cards: PlanCard[];
      quote: Quote;
      slippageBps: number;
      /** Set when the plan is refused. */
      reason?: string;
    };

type PlanCard = { cardId: number; label: string; buffer: string };

/**
 * Compares the vault's available balance with the total card buffer and, when short, quotes the
 * deficit through 1Click. Never sends anything: the result is a plan.
 */
export async function planTreasury(
  deps: {
    cards: () => Promise<Card[]>;
    balances: () => Promise<TokenBalance[]>;
    quote: (request: QuoteRequest) => Promise<Quote>;
    nowNs: () => bigint;
  },
  config: TreasuryConfig,
): Promise<TreasuryPlan> {
  const [cards, balances] = await Promise.all([deps.cards(), deps.balances()]);
  const buffers = cardBuffers(cards, config.token, deps.nowNs());
  const required = buffers.reduce((sum, b) => sum + b.buffer, 0n);
  const available = BigInt(balances.find((b) => b.token === config.token)?.available ?? "0");
  const base = {
    token: config.token,
    required: required.toString(),
    available: available.toString(),
    cards: buffers.map((b) => ({ ...b, buffer: b.buffer.toString() })),
  };
  if (available >= required) return { action: "none", ...base };

  const deficit = required - available;
  const quote = await deps.quote({
    originAsset: config.originAsset,
    destinationAsset: config.destinationAsset,
    amountOut: deficit.toString(),
    slippageBps: config.slippageBps,
    account: config.account,
    dry: true,
  });
  const plan = { ...base, deficit: deficit.toString(), quote, slippageBps: config.slippageBps };
  const reason = quoteRefusal(quote, deficit, config.maxSwapUsd);
  return reason ? { action: "refused", ...plan, reason } : { action: "top_up", ...plan };
}

/** Why a quote for `deficit` must not be used, or undefined when it may. */
export function quoteRefusal(
  quote: Quote,
  deficit: bigint,
  maxSwapUsd: number,
): string | undefined {
  if (BigInt(quote.minAmountOut) < deficit) return "quote does not guarantee the deficit";
  if (Number(quote.amountInUsd) > maxSwapUsd) {
    return `costs ${quote.amountInUsd} USD, above the ${maxSwapUsd} USD cap`;
  }
  return undefined;
}
