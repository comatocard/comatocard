import type { Card, Policy } from "@comatocard/sdk";

const DAY_NS = 86_400_000_000_000n;
const PERIOD_NS = 30n * DAY_NS;

/** The card face number: the vault's card id, padded to 16 digits. Never invented digits. */
export const cardNumber = (id: number): string => String(id).padStart(16, "0");

/** `expires_at` as MM/YY in UTC, or "None" for a card without an end date. */
export function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "None";
  const date = new Date(Number(BigInt(expiresAt) / 1_000_000n));
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${month}/${String(date.getUTCFullYear()).slice(-2)}`;
}

/** The last characters of the card key, for the pocket slot. */
export const keyTail = (publicKey: string | null): string =>
  publicKey ? publicKey.slice(-4) : "none";

export interface Spend {
  today: string;
  period: string;
}

/**
 * What the card has spent in the current UTC day and 30-day period. The vault stores the counters
 * of the window they were last written in, so a counter from an older window reads as zero.
 */
export function currentSpend(card: Card, nowMs: number): Spend {
  const now = BigInt(nowMs) * 1_000_000n;
  const day = Number(now / DAY_NS);
  const period = Number(now / PERIOD_NS);
  return {
    today: card.spend.day === day ? card.spend.day_spent : "0",
    period: card.spend.period === period ? card.spend.period_spent : "0",
  };
}

/** What the card may still spend today: the smaller of the day and period headroom. */
export function remainingToday(policy: Policy, spend: Spend): string {
  const day = BigInt(policy.daily_limit) - BigInt(spend.today);
  const period = BigInt(policy.monthly_limit) - BigInt(spend.period);
  if (day <= 0n || period <= 0n) return "0";
  // Not Math.min: these are bigints.
  if (day < period) return day.toString();
  return period.toString();
}

/**
 * What the cards that can still pay spent today, against the sum of their day limits: the
 * "Spent today 5 of 80" line under the balance. Frozen cards count, revoked ones do not.
 */
export function spentToday(
  cards: readonly Card[],
  nowMs: number,
): { spent: string; limit: string } {
  let spent = 0n;
  let limit = 0n;
  for (const card of cards) {
    if (card.status === "revoked") continue;
    spent += BigInt(currentSpend(card, nowMs).today);
    limit += BigInt(card.policy.daily_limit);
  }
  return { spent: spent.toString(), limit: limit.toString() };
}

export const KIND_LABEL = { human: "Person", agent: "Agent", treasury: "Treasury" } as const;

/** A merchant rule in words: "Any merchant", "Only a, b", "All but c". */
export function merchantsText(rule: Policy["merchants"]): string {
  if (rule === "any") return "Any merchant";
  if ("allow" in rule) return `Only ${rule.allow.join(", ")}`;
  return `All but ${rule.deny.join(", ")}`;
}
