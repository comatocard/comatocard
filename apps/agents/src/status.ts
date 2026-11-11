import { createVaultClient } from "@comatocard/sdk";
import { readCardStatus } from "./card.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel, "status");
const publicKey = config.cardKey.getPublicKey().toString();
const client = createVaultClient({ rpcUrl: config.rpcUrl, vaultId: config.vaultId });

const { vault, card } = await readCardStatus(client, publicKey);
logger.info({ network: config.network, vaultId: config.vaultId, vault }, "vault config");
if (card === null) {
  logger.error({ publicKey }, "no card is bound to this key");
  process.exitCode = 1;
} else {
  logger.info({ publicKey, card }, "card");
}
