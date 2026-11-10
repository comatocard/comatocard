import type { Block } from "./types.js";

/** One log line of a successful receipt, with its position in the chain. */
export interface ReceiptLog {
  blockHeight: number;
  blockTimestamp: string;
  receiptId: string;
  logIndex: number;
  txHash: string | null;
  executorId: string;
  line: string;
}

/** Receipts that failed are rolled back on chain, so their logs describe nothing that happened. */
function succeeded(status: Record<string, unknown>): boolean {
  return "SuccessValue" in status || "SuccessReceiptId" in status;
}

/**
 * Returns the logs of successful receipts executed by accounts that `isTracked` accepts, in
 * execution order.
 */
export function extractLogs(block: Block, isTracked: (accountId: string) => boolean): ReceiptLog[] {
  const { height, timestamp_nanosec } = block.block.header;
  const logs: ReceiptLog[] = [];
  for (const shard of block.shards) {
    for (const receipt of shard.receipt_execution_outcomes ?? []) {
      const { id, outcome } = receipt.execution_outcome;
      if (!isTracked(outcome.executor_id) || !succeeded(outcome.status)) continue;
      outcome.logs.forEach((line, logIndex) => {
        logs.push({
          blockHeight: height,
          blockTimestamp: timestamp_nanosec,
          receiptId: id,
          logIndex,
          txHash: receipt.tx_hash ?? null,
          executorId: outcome.executor_id,
          line,
        });
      });
    }
  }
  return logs;
}

/** Accepts the factory, the registry and every direct sub-account of the factory (vaults). */
export function trackedAccounts(factoryId: string, registryId: string | undefined) {
  const suffix = `.${factoryId}`;
  return (accountId: string): boolean =>
    accountId === factoryId ||
    accountId === registryId ||
    (accountId.endsWith(suffix) && !accountId.slice(0, -suffix.length).includes("."));
}
