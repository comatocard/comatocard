import { accountId, createVaultClient, u128 } from "@comatocard/sdk";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { spend } from "./spend.js";
import { cardSubmitter } from "./submit.js";

const args = z
  .tuple([accountId, u128, z.string().min(1).max(64).optional()])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  console.error("usage: pay <merchant> <amount in smallest unit> [reference, at most 64 bytes]");
  process.exit(2);
}
const [merchant, amount, reference] = args.data;

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel, "spender");
const outcome = await spend(
  {
    client: createVaultClient({ rpcUrl: config.rpcUrl, vaultId: config.vaultId }),
    publicKey: config.cardKey.getPublicKey().toString(),
    submit: cardSubmitter(config),
  },
  { merchant, amount, ...(reference === undefined ? {} : { reference }) },
);
const context = { vaultId: config.vaultId, merchant, amount, reference };
if (outcome.kind === "refused") {
  logger.warn({ ...context, preview: outcome.preview }, "payment refused before signing");
  process.exitCode = 1;
} else {
  logger.info({ ...context, ...outcome }, `payment ${outcome.decision.status}`);
  if (outcome.decision.status === "rejected") process.exitCode = 1;
}
