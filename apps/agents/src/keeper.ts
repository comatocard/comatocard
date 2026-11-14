import type { Card, TokenBalance, YieldView } from "@comatocard/sdk";
import { cardBuffers } from "./treasury.js";

/** What the keeper does with one token of a vault that lends to a venue. */
export type LendingPlan =
  | { action: "hold"; reason: string; target: string; available: string; supplied: string }
  | {
      action: "supply" | "recall";
      amount: string;
      target: string;
      available: string;
      supplied: string;
    };

export interface KeeperConfig {
  token: string;
  /** Liquid balance kept for cards, in basis points of what they may still spend. */
  bufferBps: number;
  /** Smallest move worth a transaction, in the token's smallest unit. */
  minMove: bigint;
}

/**
 * Keeps `max(min_liquid, card needs x buffer)` available and lends the rest. Cards' needs come
 * from the same spend room as the treasury agent; the vault enforces `min_liquid` on-chain and
 * recalls at most what the venue holds, so the plan cannot move funds anywhere but the venue.
 */
export function planLending(
  input: { cards: Card[]; balances: TokenBalance[]; lending: YieldView; nowNs: bigint },
  config: KeeperConfig,
): LendingPlan {
  const position = input.lending.tokens.find((t) => t.token === config.token);
  const available = BigInt(input.balances.find((b) => b.token === config.token)?.available ?? "0");
  const supplied = BigInt(position?.supplied ?? "0");
  const needs = cardBuffers(input.cards, config.token, input.nowNs).reduce(
    (sum, b) => sum + b.buffer,
    0n,
  );
  const buffered = (needs * BigInt(config.bufferBps)) / 10_000n;
  const minLiquid = BigInt(position?.min_liquid ?? "0");
  const target = larger(buffered, minLiquid);
  const base = {
    target: target.toString(),
    available: available.toString(),
    supplied: supplied.toString(),
  };

  const hold = (reason: string): LendingPlan => ({ action: "hold", reason, ...base });
  if (!input.lending.venue) return hold("no lending venue is set");
  if (!position) return hold("token is not enabled for lending");
  if (position.pending) return hold("a lending operation is in flight");
  if (available > target) {
    const surplus = available - target;
    return surplus >= config.minMove
      ? { action: "supply", amount: surplus.toString(), ...base }
      : hold("surplus below the minimum move");
  }
  if (available < target && supplied > 0n) {
    // Ask for the whole shortfall; the vault takes at most what the venue holds.
    return { action: "recall", amount: (target - available).toString(), ...base };
  }
  return hold("available matches the target");
}

// Math.max does not take bigint.
function larger(a: bigint, b: bigint): bigint {
  return b > a ? b : a;
}
