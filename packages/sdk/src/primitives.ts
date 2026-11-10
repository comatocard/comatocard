import { z } from "zod";

/** NEAR account id. */
export const accountId = z
  .string()
  .min(2)
  .max(64)
  .regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, "invalid NEAR account id");

/** NEAR public key in string form, for example `ed25519:...`. */
export const publicKey = z
  .string()
  .regex(/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/, "invalid NEAR public key");

/** Unsigned 128-bit integer encoded as a decimal string (`U128`). */
export const u128 = z.string().regex(/^(0|[1-9]\d*)$/, "expected a decimal integer string");

/** Unsigned 64-bit integer encoded as a decimal string (`U64`), used for nanosecond timestamps. */
export const u64 = u128;

/** `u32` or `u64` identifier encoded as a JSON number. */
export const id = z.number().int().nonnegative();

export type AccountId = z.infer<typeof accountId>;
export type PublicKey = z.infer<typeof publicKey>;
export type U128 = z.infer<typeof u128>;
