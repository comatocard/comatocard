import { z } from "zod";

/** Body of `POST /relay`: a NEP-366 `SignedDelegate`, borsh-encoded, then base64. */
export const relayRequest = z.strictObject({ signed_delegate: z.base64().min(1) });

/** Why the relayer refused to sponsor a delegate action; nothing was sent on chain. */
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
