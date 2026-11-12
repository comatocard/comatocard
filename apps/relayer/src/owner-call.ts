import { accountId, OWNER_ASYNC_CALL_GAS, relayResponse } from "@comatocard/sdk";
import {
  Account,
  actions,
  encodeSignedDelegate,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  type KeyPairString,
} from "near-api-js";
import { z } from "zod";

// Signs an owner method call as a NEP-366 delegate action and asks the relayer to sponsor it.
// The owner key signs only; the relayer account pays the gas.

const env = z
  .object({
    OWNER_ACCOUNT_ID: accountId,
    OWNER_PRIVATE_KEY: z.string().startsWith("ed25519:"),
    RELAYER_URL: z.url().default("http://localhost:4100"),
    RPC_URL: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.url().default("https://rpc.testnet.near.org"),
    ),
  })
  .parse(process.env);
const args = z
  .tuple([accountId, z.string().min(1), z.string().default("{}")])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  console.error("usage: owner-call <vault> <method> [json args]");
  process.exit(2);
}
const [vault, method, json] = args.data;

const owner = new Account(
  env.OWNER_ACCOUNT_ID,
  new JsonRpcProvider({ url: env.RPC_URL }),
  new KeyPairSigner(KeyPair.fromString(env.OWNER_PRIVATE_KEY as KeyPairString)),
);
const { signedDelegate } = await owner.createSignedMetaTransaction({
  receiverId: vault,
  actions: [
    actions.functionCall(method, JSON.parse(json) as object, BigInt(OWNER_ASYNC_CALL_GAS), 0n),
  ],
  blockHeightTtl: 120,
});
const response = await fetch(new URL("relay", `${env.RELAYER_URL}/`), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    signed_delegate: Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64"),
  }),
});
const result = relayResponse.parse(await response.json());
console.log(JSON.stringify(result));
if (result.status !== "relayed" || result.failure !== null) process.exitCode = 1;
