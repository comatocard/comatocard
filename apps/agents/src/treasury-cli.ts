import { accountId, createVaultClient } from "@comatocard/sdk";
import {
  Account,
  actions,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  type KeyPairString,
} from "near-api-js";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { getSwapStatus, quoteExactOutput, submitDeposit } from "./oneclick.js";
import { planTreasury } from "./treasury.js";
import { executeTopUp, WRAP_NEAR } from "./treasury-execute.js";

// A dry run by default: prints the plan and never signs or sends. `--execute` swaps on mainnet
// from TREASURY_ACCOUNT. Q-007: NEAR Intents has no testnet, so the testnet token is quoted as
// its mainnet counterpart.

const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);
const env = z
  .object({
    VAULT_ID: accountId,
    RPC_URL: z.preprocess(unsetIfEmpty, z.url().default("https://rpc.testnet.near.org")),
    TREASURY_TOKEN: z.preprocess(unsetIfEmpty, accountId.default("tusd.comatocard.testnet")),
    // Mainnet USDC on NEAR, 6 decimals like tUSD.
    TREASURY_DESTINATION_ASSET: z.preprocess(
      unsetIfEmpty,
      z.string().default("nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"),
    ),
    TREASURY_ORIGIN_ASSET: z.preprocess(unsetIfEmpty, z.string().default("nep141:wrap.near")),
    TREASURY_ACCOUNT: accountId,
    TREASURY_SLIPPAGE_BPS: z.preprocess(
      unsetIfEmpty,
      z.coerce.number().int().min(1).max(1_000).default(100),
    ),
    TREASURY_MAX_SWAP_USD: z.preprocess(unsetIfEmpty, z.coerce.number().positive().default(20)),
    ONECLICK_JWT: z.preprocess(unsetIfEmpty, z.string().optional()),
    // Only read with --execute. Full access key of TREASURY_ACCOUNT on mainnet.
    TREASURY_PRIVATE_KEY: z.preprocess(unsetIfEmpty, z.string().startsWith("ed25519:").optional()),
    MAINNET_RPC_URL: z.preprocess(unsetIfEmpty, z.url().default("https://rpc.mainnet.near.org")),
    LOG_LEVEL: z.preprocess(unsetIfEmpty, z.string().default("info")),
  })
  .parse(process.env);

const execute = process.argv.includes("--execute");
const logger = createLogger(env.LOG_LEVEL, "treasury");
const oneclick = env.ONECLICK_JWT ? { jwt: env.ONECLICK_JWT } : {};
const client = createVaultClient({ rpcUrl: env.RPC_URL, vaultId: env.VAULT_ID });
const config = {
  token: env.TREASURY_TOKEN,
  destinationAsset: env.TREASURY_DESTINATION_ASSET,
  originAsset: env.TREASURY_ORIGIN_ASSET,
  slippageBps: env.TREASURY_SLIPPAGE_BPS,
  maxSwapUsd: env.TREASURY_MAX_SWAP_USD,
  account: env.TREASURY_ACCOUNT,
};
const plan = await planTreasury(
  {
    cards: () => client.listCards({ limit: 100 }),
    balances: () => client.getBalances(),
    quote: (request) => quoteExactOutput(request, oneclick),
    nowNs: () => BigInt(Date.now()) * 1_000_000n,
  },
  config,
);
logger.info({ vaultId: env.VAULT_ID, dryRun: !execute, plan }, `treasury plan: ${plan.action}`);
if (plan.action === "refused") process.exitCode = 1;
if (execute && plan.action === "top_up") {
  if (!env.TREASURY_PRIVATE_KEY) throw new Error("--execute needs TREASURY_PRIVATE_KEY");
  if (env.TREASURY_ACCOUNT.endsWith(".testnet")) {
    throw new Error("--execute swaps on mainnet, TREASURY_ACCOUNT must be a mainnet account");
  }
  const signer = new KeyPairSigner(KeyPair.fromString(env.TREASURY_PRIVATE_KEY as KeyPairString));
  const account = new Account(
    env.TREASURY_ACCOUNT,
    new JsonRpcProvider({ url: env.MAINNET_RPC_URL }),
    signer,
  );
  const execution = await executeTopUp(
    {
      quote: (request) => quoteExactOutput(request, oneclick),
      send: async (calls) => {
        const response = await account.signAndSendTransaction({
          receiverId: WRAP_NEAR,
          actions: calls.map((c) => actions.functionCall(c.methodName, c.args, c.gas, c.deposit)),
        });
        return response.transaction.hash;
      },
      submit: (txHash, depositAddress) =>
        submitDeposit(
          { txHash, depositAddress, nearSenderAccount: env.TREASURY_ACCOUNT },
          oneclick,
        ),
      status: (depositAddress) => getSwapStatus(depositAddress, oneclick),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    config,
    BigInt(plan.deficit),
  );
  logger.info({ execution }, `treasury swap: ${execution.status}`);
  if (execution.status !== "SUCCESS") process.exitCode = 1;
}
