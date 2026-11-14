import type { Proposal } from "@comatocard/agents/policy-assistant";
import type { Card } from "@comatocard/sdk";
import { vi } from "vitest";
import type { AssistantDeps } from "../../src/assistant.js";
import { FACTORY } from "./support.js";

export const VAULT = `alice.${FACTORY}`;

export const card: Card = {
  id: 0,
  label: "spending agent",
  kind: "agent",
  public_key: null,
  holder: null,
  status: "active",
  policy: {
    token: "tusd.comatocard.testnet",
    per_tx_limit: "5000000",
    daily_limit: "20000000",
    monthly_limit: "100000000",
    approval_threshold: null,
    merchants: "any",
    valid_from: null,
    expires_at: null,
    risk_mode: "off",
  },
  spend: { day: 0, day_spent: "0", period: 0, period_spent: "0" },
  created_at: "1794000000000000000",
};

export const proposal = {
  kind: "invalid",
  cardId: 0,
  reason: "the answer holds no JSON object",
  answer: "ok",
  verification: { verified: true },
} as unknown as Proposal;

export function assistantDeps(overrides: Partial<AssistantDeps> = {}): AssistantDeps {
  return {
    factoryId: FACTORY,
    allow: () => true,
    card: vi.fn(async () => card),
    propose: vi.fn(async () => proposal),
    logger: { warn: vi.fn() },
    ...overrides,
  };
}
