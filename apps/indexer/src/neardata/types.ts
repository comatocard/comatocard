import { z } from "zod";

/** The subset of a neardata block the indexer reads. Unknown fields are ignored. */
export const blockSchema = z.object({
  block: z.object({
    header: z.object({
      height: z.number().int().nonnegative(),
      timestamp_nanosec: z.string().regex(/^\d+$/),
      hash: z.string(),
    }),
  }),
  shards: z.array(
    z.object({
      shard_id: z.number().int(),
      receipt_execution_outcomes: z
        .array(
          z.object({
            tx_hash: z.string().nullable().optional(),
            execution_outcome: z.object({
              id: z.string(),
              outcome: z.object({
                executor_id: z.string(),
                logs: z.array(z.string()),
                status: z.record(z.string(), z.unknown()),
              }),
            }),
          }),
        )
        .nullable()
        .optional(),
    }),
  ),
});

export type Block = z.infer<typeof blockSchema>;
