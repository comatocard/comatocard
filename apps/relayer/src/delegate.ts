import { createHash, createPublicKey, verify } from "node:crypto";
import { deserialize } from "borsh";
import { encodeDelegateAction, SCHEMA, type SignedDelegate } from "near-api-js";

/** A function call inside a delegate action, with its JSON arguments decoded. */
export interface DelegatedCall {
  methodName: string;
  args: unknown;
  gas: bigint;
  deposit: bigint;
}

/** The parts of a signed delegate the relayer decides on. */
export interface Delegate {
  senderId: string;
  receiverId: string;
  /** `null` for an action that is not a function call. */
  calls: (DelegatedCall | null)[];
  signed: SignedDelegate;
}

interface RawSignedDelegate {
  delegateAction: {
    senderId: string;
    receiverId: string;
    actions: {
      functionCall?: { methodName: string; args: number[]; gas: bigint; deposit: bigint };
    }[];
    publicKey: { ed25519Key?: { data: number[] } };
  };
  signature: { ed25519Signature?: { data: number[] } };
}

/** Decodes a base64 borsh `SignedDelegate`; throws on malformed input. */
export function decodeDelegate(base64: string): Delegate {
  const raw = deserialize(
    SCHEMA.SignedDelegate,
    Buffer.from(base64, "base64"),
  ) as RawSignedDelegate;
  const { delegateAction } = raw;
  return {
    senderId: delegateAction.senderId,
    receiverId: delegateAction.receiverId,
    calls: delegateAction.actions.map((action) => {
      const call = action.functionCall;
      if (call === undefined) return null;
      return {
        methodName: call.methodName,
        args: parseArgs(call.args),
        gas: BigInt(call.gas),
        deposit: BigInt(call.deposit),
      };
    }),
    signed: raw as unknown as SignedDelegate,
  };
}

function parseArgs(bytes: number[]): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Whether the ed25519 signature covers the delegate action (NEP-366 hash of the NEP-461 encoding). */
export function hasValidSignature(delegate: Delegate): boolean {
  const raw = delegate.signed as unknown as RawSignedDelegate;
  const key = raw.delegateAction.publicKey.ed25519Key?.data;
  const signature = raw.signature.ed25519Signature?.data;
  if (key === undefined || signature === undefined) return false;
  const message = createHash("sha256")
    .update(encodeDelegateAction(delegate.signed.delegateAction))
    .digest();
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(key).toString("base64url") },
    format: "jwk",
  });
  return verify(null, message, publicKey, Buffer.from(signature));
}
