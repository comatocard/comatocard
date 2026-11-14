import type { Card } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import {
  cardNumber,
  currentSpend,
  expiryLabel,
  keyTail,
  remainingToday,
  spentToday,
} from "../src/lib/cards";
import { paymentDetail, reasonText } from "../src/lib/payments";

const DAY_MS = 86_400_000;
const now = 20_769 * DAY_MS + 3_600_000; // 2026-11-12 01:00 UTC, day 20769, period 692

const card: Card = {
  id: 3,
  label: "spending agent",
  kind: "agent",
  public_key: "ed25519:ECmpZ6MBzMMaD6PngW25HGU8qqzv1a32kvD7RzVLEUW4",
  holder: null,
  status: "active",
  policy: {
    token: "tusd.comatocard.testnet",
    per_tx_limit: "20000000",
    daily_limit: "50000000",
    monthly_limit: "60000000",
    approval_threshold: "10000000",
    merchants: "any",
    valid_from: null,
    expires_at: null,
    risk_mode: "block_only",
  },
  spend: { day: 20_769, day_spent: "5000000", period: 692, period_spent: "22000000" },
  created_at: "1794374975194826261",
};

describe("cards", () => {
  it("shows the card id as the number and never invents digits", () => {
    expect(cardNumber(3)).toBe("0000000000000003");
    expect(keyTail(card.public_key)).toBe("EUW4");
    expect(keyTail(null)).toBe("none");
  });

  it("formats the expiry in UTC", () => {
    expect(expiryLabel(null)).toBe("None");
    expect(expiryLabel((BigInt(Date.parse("2027-03-31T23:59:59Z")) * 1_000_000n).toString())).toBe(
      "03/27",
    );
  });

  it("reads counters only for the current day and period", () => {
    expect(currentSpend(card, now)).toEqual({ today: "5000000", period: "22000000" });
    expect(currentSpend(card, now + DAY_MS)).toEqual({ today: "0", period: "22000000" });
    expect(currentSpend(card, now + 30 * DAY_MS)).toEqual({ today: "0", period: "0" });
  });

  it("caps what is left today by the period", () => {
    expect(remainingToday(card.policy, { today: "5000000", period: "22000000" })).toBe("38000000");
    expect(remainingToday(card.policy, { today: "0", period: "55000000" })).toBe("5000000");
    expect(remainingToday(card.policy, { today: "0", period: "70000000" })).toBe("0");
  });
});

describe("payment wording", () => {
  it("explains every reason in plain words and falls back to the code", () => {
    expect(reasonText("per_tx_limit")).toBe("above the per payment limit");
    expect(reasonText("something_new")).toBe("something new");
    const row = {
      id: 1,
      payment_id: 1,
      vault_id: "v.factory.testnet",
      card_id: 0,
      merchant: "shop.testnet",
      token: "tusd.testnet",
      amount: "1",
      memo: null,
      reference: null,
      status: "queued" as const,
      queue_cause: "threshold" as const,
      reason: null,
      approver_id: null,
      tx_hash: null,
      created_at: "0",
      updated_at: "0",
    };
    expect(paymentDetail(row)).toBe("above the approval threshold");
    expect(paymentDetail({ ...row, status: "settled", approver_id: "council.testnet" })).toBe(
      "approved by council.testnet",
    );
  });

  it("adds up today's spend over the cards that can still pay", () => {
    const frozen: Card = { ...card, id: 4, status: "frozen" };
    const revoked: Card = { ...card, id: 5, status: "revoked" };
    const stale: Card = { ...card, id: 6, spend: { ...card.spend, day: 20_768 } };
    expect(spentToday([card, frozen, revoked, stale], now)).toEqual({
      spent: "10000000",
      limit: "150000000",
    });
    expect(spentToday([], now)).toEqual({ spent: "0", limit: "0" });
  });
});
