import {
  actions,
  buildDelegateAction,
  encodeSignedDelegate,
  KeyPair,
  KeyPairSigner,
} from "near-api-js";

export const FACTORY = "factory.comatocard.testnet";
export const VAULT = `alice.${FACTORY}`;
export const OWNER = "alice.testnet";

export const call = (method: string, args: object = {}, deposit = 0n) =>
  actions.functionCall(method, args, 30_000_000_000_000n, deposit);

/** A signed delegate in the wire format of `POST /relay`. */
export async function signedDelegate(options: {
  sender?: string;
  receiver?: string;
  actions?: ReturnType<typeof call>[];
  key?: KeyPair;
}): Promise<string> {
  const key = options.key ?? KeyPair.fromRandom("ed25519");
  const delegateAction = buildDelegateAction({
    senderId: options.sender ?? OWNER,
    receiverId: options.receiver ?? VAULT,
    actions: options.actions ?? [call("freeze_card", { card_id: 0 })],
    nonce: 7n,
    maxBlockHeight: 1_000n,
    publicKey: key.getPublicKey(),
  });
  const { signedDelegate: signed } = await new KeyPairSigner(key).signDelegateAction(
    delegateAction,
  );
  return Buffer.from(encodeSignedDelegate(signed)).toString("base64");
}
