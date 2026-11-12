import { accountId, createVaultClient } from "@comatocard/sdk";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { quoteExactOutput } from "./oneclick.js";
import { planTreasury } from "./treasury.js";

// Dry run only: prints the plan and never signs or sends. Q-007: NEAR Intents has no testnet,
// so the testnet token is quoted as its mainnet counterpart.

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
    LOG_LEVEL: z.preprocess(unsetIfEmpty, z.string().default("info")),
  })
  .parse(process.env);

const logger = createLogger(env.LOG_LEVEL, "treasury");
const client = createVaultClient({ rpcUrl: env.RPC_URL, vaultId: env.VAULT_ID });
const plan = await planTreasury(
  {
    cards: () => client.listCards({ limit: 100 }),
    balances: () => client.getBalances(),
    quote: (request) =>
      quoteExactOutput(request, env.ONECLICK_JWT ? { jwt: env.ONECLICK_JWT } : {}),
    nowNs: () => BigInt(Date.now()) * 1_000_000n,
  },
  {
    token: env.TREASURY_TOKEN,
    destinationAsset: env.TREASURY_DESTINATION_ASSET,
    originAsset: env.TREASURY_ORIGIN_ASSET,
    slippageBps: env.TREASURY_SLIPPAGE_BPS,
    maxSwapUsd: env.TREASURY_MAX_SWAP_USD,
    account: env.TREASURY_ACCOUNT,
  },
);
logger.info({ vaultId: env.VAULT_ID, dryRun: true, plan }, `treasury plan: ${plan.action}`);
