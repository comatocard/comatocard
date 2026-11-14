import { accountId, createVaultClient, vaultCalls } from "@comatocard/sdk";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, type KeyPairString } from "near-api-js";
import { z } from "zod";
import { planLending } from "./keeper.js";
import { createLogger } from "./logger.js";

// Lending keeper. A dry run by default: prints the plan. `--execute` sends `supply` or `recall`
// signed by KEEPER_ACCOUNT, the keeper the vault owner set with `set_yield_venue`. The vault
// enforces min_liquid and only ever moves funds between itself and its venue.

const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);
const env = z
  .object({
    VAULT_ID: accountId,
    RPC_URL: z.preprocess(unsetIfEmpty, z.url().default("https://rpc.testnet.near.org")),
    LENDING_TOKEN: z.preprocess(unsetIfEmpty, accountId.default("usdc.fakes.testnet")),
    KEEPER_BUFFER_BPS: z.preprocess(
      unsetIfEmpty,
      z.coerce.number().int().min(10_000).max(100_000).default(15_000),
    ),
    KEEPER_MIN_MOVE: z.preprocess(unsetIfEmpty, z.coerce.bigint().min(1n).default(1_000_000n)),
    KEEPER_ACCOUNT: z.preprocess(unsetIfEmpty, accountId.optional()),
    // Only read with --execute.
    KEEPER_PRIVATE_KEY: z.preprocess(unsetIfEmpty, z.string().startsWith("ed25519:").optional()),
    LOG_LEVEL: z.preprocess(unsetIfEmpty, z.string().default("info")),
  })
  .parse(process.env);

const execute = process.argv.includes("--execute");
const logger = createLogger(env.LOG_LEVEL, "keeper");
const client = createVaultClient({ rpcUrl: env.RPC_URL, vaultId: env.VAULT_ID });
const [cards, balances, lending] = await Promise.all([
  client.listCards({ limit: 100 }),
  client.getBalances(),
  client.getYield(),
]);
const plan = planLending(
  { cards, balances, lending, nowNs: BigInt(Date.now()) * 1_000_000n },
  { token: env.LENDING_TOKEN, bufferBps: env.KEEPER_BUFFER_BPS, minMove: env.KEEPER_MIN_MOVE },
);
logger.info({ vaultId: env.VAULT_ID, dryRun: !execute, plan }, `keeper plan: ${plan.action}`);

if (execute && plan.action !== "hold") {
  if (!env.KEEPER_ACCOUNT || !env.KEEPER_PRIVATE_KEY) {
    throw new Error("--execute needs KEEPER_ACCOUNT and KEEPER_PRIVATE_KEY");
  }
  const calls = vaultCalls(env.VAULT_ID);
  const call =
    plan.action === "supply"
      ? calls.supply(env.LENDING_TOKEN, plan.amount)
      : calls.recall(env.LENDING_TOKEN, plan.amount);
  const signer = new KeyPairSigner(KeyPair.fromString(env.KEEPER_PRIVATE_KEY as KeyPairString));
  const account = new Account(
    env.KEEPER_ACCOUNT,
    new JsonRpcProvider({ url: env.RPC_URL }),
    signer,
  );
  const response = await account.callFunctionRaw({
    contractId: call.receiverId,
    methodName: call.methodName,
    args: call.args,
    gas: call.gas,
    deposit: call.deposit,
  });
  logger.info(
    { txHash: response.transaction.hash, call: call.methodName },
    `keeper sent ${call.methodName}`,
  );
  const after = await client.getYield();
  logger.info({ lending: after }, "lending after the call");
}
