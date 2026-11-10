import { parseEventLog } from "@comatocard/sdk";
import { eq } from "drizzle-orm";
import type { EventBus, StreamEvent } from "../bus.js";
import type { Database } from "../db/client.js";
import { cursor, deadLetters, events } from "../db/schema.js";
import type { Logger } from "../logger.js";
import type { BlockSource } from "../neardata/client.js";
import { extractLogs } from "../neardata/extract.js";
import type { Block } from "../neardata/types.js";
import { project } from "./project.js";

const CURSOR_ID = "main";

export interface RunnerOptions {
  db: Database;
  source: BlockSource;
  bus: EventBus;
  logger: Logger;
  isTracked: (accountId: string) => boolean;
  /** Height to start from when no cursor is stored; defaults to the current final height. */
  startBlock?: number | undefined;
  pollIntervalMs: number;
}

export interface BlockResult {
  height: number;
  indexed: number;
  duplicates: number;
  deadLetters: number;
}

/** Indexes one block atomically: raw events, projections, dead letters and the cursor. */
export async function indexBlock(
  options: Pick<RunnerOptions, "db" | "isTracked">,
  height: number,
  block: Block | null,
): Promise<{ result: BlockResult; published: StreamEvent[] }> {
  const result: BlockResult = { height, indexed: 0, duplicates: 0, deadLetters: 0 };
  const published: StreamEvent[] = [];
  const logs = block ? extractLogs(block, options.isTracked) : [];
  await options.db.transaction(async (tx) => {
    for (const log of logs) {
      const parsed = parseEventLog(log.line);
      if (!parsed.ok) {
        if (parsed.reason === "invalid") {
          await tx
            .insert(deadLetters)
            .values({
              receiptId: log.receiptId,
              logIndex: log.logIndex,
              blockHeight: log.blockHeight,
              contractId: log.executorId,
              line: log.line,
              error: parsed.error,
            })
            .onConflictDoNothing();
          result.deadLetters += 1;
        }
        continue;
      }
      const inserted = await tx
        .insert(events)
        .values({
          receiptId: log.receiptId,
          logIndex: log.logIndex,
          blockHeight: log.blockHeight,
          blockTimestamp: log.blockTimestamp,
          txHash: log.txHash,
          contractId: log.executorId,
          event: parsed.event.event,
          version: parsed.event.version,
          data: parsed.event.data,
        })
        .onConflictDoNothing()
        .returning({ receiptId: events.receiptId });
      if (inserted.length === 0) {
        result.duplicates += 1;
        continue;
      }
      await project(
        tx,
        {
          contractId: log.executorId,
          receiptId: log.receiptId,
          logIndex: log.logIndex,
          blockHeight: log.blockHeight,
          blockTimestamp: log.blockTimestamp,
          txHash: log.txHash,
        },
        parsed.event,
      );
      result.indexed += 1;
      published.push({
        contract_id: log.executorId,
        event: parsed.event.event,
        data: parsed.event.data,
        block_height: log.blockHeight,
        tx_hash: log.txHash,
        timestamp: log.blockTimestamp,
      });
    }
    await tx
      .insert(cursor)
      .values({ id: CURSOR_ID, height })
      .onConflictDoUpdate({ target: cursor.id, set: { height } });
  });
  return { result, published };
}

export async function storedHeight(db: Database): Promise<number | undefined> {
  const rows = await db.select().from(cursor).where(eq(cursor.id, CURSOR_ID));
  return rows[0]?.height;
}

/** Ingestion state shared with the health endpoint. */
export interface RunnerState {
  indexedHeight: number | undefined;
  chainHeight: number | undefined;
}

/**
 * Follows the chain until `signal` aborts: indexes every height after the cursor up to the
 * final head, then waits `pollIntervalMs` and checks again. Events are published only after
 * their block is committed.
 */
export async function run(options: RunnerOptions, state: RunnerState, signal: AbortSignal) {
  const { db, source, bus, logger } = options;
  const stored = await storedHeight(db);
  let next =
    stored === undefined ? (options.startBlock ?? (await source.finalHeight())) : stored + 1;
  state.indexedHeight = stored;
  logger.info({ next }, "indexer starting");

  while (!signal.aborted) {
    try {
      const head = await source.finalHeight();
      state.chainHeight = head;
      while (next <= head && !signal.aborted) {
        const block = await source.block(next);
        const { result, published } = await indexBlock(options, next, block);
        for (const event of published) bus.publish(event);
        if (result.indexed + result.deadLetters > 0) logger.info(result, "block indexed");
        state.indexedHeight = next;
        next += 1;
      }
    } catch (error) {
      logger.error({ err: error, next }, "indexing failed, retrying");
    }
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, options.pollIntervalMs);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
  }
  logger.info({ indexedHeight: state.indexedHeight }, "indexer stopped");
}
