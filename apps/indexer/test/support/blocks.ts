import type { BlockSource } from "../../src/neardata/client.js";
import type { Block } from "../../src/neardata/types.js";

export const FACTORY = "factory.comatocard.testnet";
export const REGISTRY = "registry.comatocard.testnet";
export const VAULT = `alice.${FACTORY}`;
export const TOKEN = "tusd.comatocard.testnet";

/** Nanosecond timestamp of block `height` in the fixtures: one block per second from a base. */
export const timestampOf = (height: number) =>
  (1_794_000_000_000_000_000n + BigInt(height) * 1_000_000_000n).toString();

export interface Outcome {
  executor: string;
  logs: string[];
  failed?: boolean;
  receiptId?: string;
  txHash?: string;
}

/** Builds a neardata-shaped block with the given receipt outcomes in one shard. */
export function makeBlock(height: number, outcomes: Outcome[]): Block {
  return {
    block: {
      header: { height, timestamp_nanosec: timestampOf(height), hash: `block-${height}` },
    },
    shards: [
      {
        shard_id: 0,
        receipt_execution_outcomes: outcomes.map((o, i) => ({
          tx_hash: o.txHash ?? `tx-${height}-${i}`,
          execution_outcome: {
            id: o.receiptId ?? `receipt-${height}-${i}`,
            outcome: {
              executor_id: o.executor,
              logs: o.logs,
              status: o.failed ? { Failure: { ActionError: {} } } : { SuccessValue: "" },
            },
          },
        })),
      },
    ],
  };
}

/** A NEP-297 log line in the Comatocard envelope. */
export function eventLine(event: string, data: Record<string, unknown>): string {
  return `EVENT_JSON:${JSON.stringify({ standard: "comatocard", version: "1.0.0", event, data: [data] })}`;
}

/** Serves recorded blocks; heights without a block return `null`, like neardata. */
export function fixtureSource(
  blocks: Block[],
  head?: number,
): BlockSource & { requests: number[] } {
  const byHeight = new Map(blocks.map((b) => [b.block.header.height, b]));
  const requests: number[] = [];
  const top = head ?? Math.max(...byHeight.keys());
  return {
    requests,
    finalHeight: async () => top,
    block: async (height) => {
      requests.push(height);
      return byHeight.get(height) ?? null;
    },
  };
}

export const policy = {
  token: TOKEN,
  per_tx_limit: "100000000",
  daily_limit: "150000000",
  monthly_limit: "1000000000",
  approval_threshold: "50000000",
  merchants: "any",
  valid_from: null,
  expires_at: null,
  risk_mode: "block_only",
};

const payment = (id: number, merchant: string, amount: string) => ({
  payment_id: id,
  card_id: 0,
  merchant,
  token: TOKEN,
  amount,
});

/**
 * A realistic history: vault creation, a card, a deposit, a settled payment, a queued payment
 * that is approved and settles, a rejection, a failed transfer, a registry block, plus noise the
 * indexer must ignore (another contract, a failed receipt, an invalid event).
 */
export function scenario(): Block[] {
  return [
    makeBlock(100, [
      {
        executor: FACTORY,
        logs: [
          eventLine("vault_created", {
            vault_id: VAULT,
            owner_id: "alice.testnet",
            code_version: 1,
          }),
        ],
      },
      {
        executor: "unrelated.testnet",
        logs: [
          eventLine("vault_created", {
            vault_id: "x.testnet",
            owner_id: "x.testnet",
            code_version: 1,
          }),
        ],
      },
    ]),
    makeBlock(101, [
      {
        executor: VAULT,
        logs: [
          eventLine("card_created", {
            card_id: 0,
            public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp",
            label: "research agent",
            kind: "agent",
            policy,
          }),
          eventLine("approver_set", { account_id: "council.testnet", max_amount: "80000000" }),
        ],
      },
      {
        executor: VAULT,
        logs: [
          eventLine("deposit", { token: TOKEN, sender_id: "alice.testnet", amount: "500000000" }),
        ],
      },
    ]),
    makeBlock(103, [
      {
        executor: VAULT,
        txHash: "tx-pay-0",
        logs: [
          eventLine("payment_submitted", {
            ...payment(0, "shop.testnet", "40000000"),
            memo: "api credits",
            reference: "inv-1",
          }),
        ],
      },
    ]),
    makeBlock(104, [
      {
        executor: VAULT,
        logs: [
          eventLine("payment_settled", {
            ...payment(0, "shop.testnet", "40000000"),
            reference: "inv-1",
          }),
        ],
      },
      {
        executor: VAULT,
        txHash: "tx-pay-1",
        logs: [
          eventLine("payment_queued", {
            ...payment(1, "travel.testnet", "60000000"),
            memo: null,
            reference: null,
            cause: "threshold",
          }),
        ],
      },
    ]),
    makeBlock(105, [
      {
        executor: VAULT,
        logs: [
          eventLine("payment_rejected", {
            card_id: 0,
            merchant: "shop.testnet",
            token: TOKEN,
            amount: "101000000",
            reason: "per_tx_limit",
            reference: "inv-2",
          }),
        ],
      },
      {
        executor: VAULT,
        failed: true,
        logs: [
          eventLine("payment_rejected", {
            card_id: 0,
            merchant: "ghost.testnet",
            token: TOKEN,
            amount: "1",
            reason: "amount_zero",
            reference: null,
          }),
        ],
      },
      {
        executor: VAULT,
        logs: ["plain log line", eventLine("payment_settled", { payment_id: "bad" })],
      },
    ]),
    makeBlock(106, [
      {
        executor: VAULT,
        logs: [eventLine("payment_approved", { payment_id: 1, approver_id: "council.testnet" })],
      },
    ]),
    makeBlock(107, [
      {
        executor: VAULT,
        logs: [
          eventLine("payment_settled", {
            ...payment(1, "travel.testnet", "60000000"),
            reference: null,
          }),
        ],
      },
      {
        executor: VAULT,
        txHash: "tx-pay-2",
        logs: [
          eventLine("payment_submitted", {
            ...payment(2, "scam.testnet", "10000000"),
            memo: null,
            reference: null,
          }),
        ],
      },
    ]),
    makeBlock(108, [
      {
        executor: REGISTRY,
        logs: [
          eventLine("report_submitted", {
            report_id: 0,
            account_id: "scam.testnet",
            reporter_id: "bob.testnet",
            category: "scam",
            evidence_uri: "ipfs://evidence",
          }),
          eventLine("status_changed", {
            account_id: "scam.testnet",
            status: "blocked",
            curator_id: "curator.testnet",
            report_ids: [0],
          }),
        ],
      },
      {
        executor: VAULT,
        logs: [
          eventLine("payment_failed", {
            ...payment(2, "scam.testnet", "10000000"),
            cause: "merchant_blocked",
          }),
        ],
      },
    ]),
  ];
}
