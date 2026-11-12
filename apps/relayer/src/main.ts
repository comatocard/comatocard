import { createVaultClient, riskAssessment } from "@comatocard/sdk";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { createRelayServer } from "./server.js";

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel, base: { service: "comatocard-relayer" } });
const relayer = new Account(
  config.relayerAccountId,
  new JsonRpcProvider({ url: config.rpcUrl }),
  new KeyPairSigner(config.relayerKey),
);

const server = createRelayServer({
  factoryId: config.factoryId,
  logger,
  vault: async (vaultId) => {
    const client = createVaultClient({ rpcUrl: config.rpcUrl, vaultId });
    const [vaultConfig, approvers] = await Promise.all([
      client.getConfig(),
      client.listApprovers(),
    ]);
    return { config: vaultConfig, approvers: approvers.map((a) => a.account_id) };
  },
  risk: async (accountId, vaultId) => {
    const url = new URL(`risk/${encodeURIComponent(accountId)}`, `${config.indexerUrl}/`);
    url.searchParams.set("vault", vaultId);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`indexer responded ${response.status}`);
    return riskAssessment.parse(await response.json());
  },
  send: async (delegate) => {
    const response = await relayer.relayMetaTransaction(delegate.signed);
    const failed = response.receipts_outcome.find((r) => "Failure" in Object(r.outcome.status));
    return {
      txHash: response.transaction.hash,
      failure: failed === undefined ? null : JSON.stringify(Object(failed.outcome.status).Failure),
    };
  },
});

server.listen(config.port, () => {
  logger.info(
    { port: config.port, network: config.network, relayer: config.relayerAccountId },
    "relayer listening",
  );
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
