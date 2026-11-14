import { z } from "zod";

/** Body of `POST /relay`: a NEP-366 `SignedDelegate`, borsh-encoded, then base64. */
export const relayRequest = z.strictObject({ signed_delegate: z.base64().min(1) });

/**
 * Why the relayer did not sponsor a delegate action. `expired` and `nonce_used` can also come from
 * the chain after sending; the delegated call did not run either way.
 */
export const relayRefusal = z.enum([
  "malformed",
  "bad_signature",
  "not_a_vault",
  "action_not_allowed",
  "method_not_allowed",
  "deposit_not_zero",
  "not_authorized",
  "receiver_blocked",
  "risk_unavailable",
  /** The delegate passed its `max_block_height` before it reached the chain: sign again. */
  "expired",
  /** The delegate's nonce was already used, for example by a double submit: sign again. */
  "nonce_used",
]);

export const relayResponse = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("relayed"),
    tx_hash: z.string(),
    /** Execution error of the delegated call, null when it succeeded. */
    failure: z.string().nullable(),
  }),
  z.strictObject({ status: z.literal("refused"), reason: relayRefusal, detail: z.string() }),
]);

export type RelayRequest = z.infer<typeof relayRequest>;
export type RelayRefusal = z.infer<typeof relayRefusal>;
export type RelayResponse = z.infer<typeof relayResponse>;
