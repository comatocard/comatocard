import { serve, upgradeWebSocket, type WebSocketServerLike } from "@hono/node-server";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { WebSocketServer } from "ws";
import { createApp } from "./api/app.js";
import { EventBus } from "./bus.js";
import { loadConfig } from "./config.js";
import type { Database } from "./db/client.js";
import { MIGRATIONS_FOLDER } from "./db/migrate.js";
import * as schema from "./db/schema.js";
import { type RunnerState, run } from "./ingest/runner.js";
import { createLogger } from "./logger.js";
import { neardataSource } from "./neardata/client.js";
import { trackedAccounts } from "./neardata/extract.js";
import { rpcChainReader } from "./risk/chain.js";
import { riskService } from "./risk/service.js";
import { tokenDecimalsReader } from "./tokens.js";

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const sqlClient = postgres(config.databaseUrl, { max: 10 });
const db = drizzle(sqlClient, { schema }) as unknown as Database;
await migrate(drizzle(sqlClient), { migrationsFolder: MIGRATIONS_FOLDER });

const bus = new EventBus();
const state: RunnerState = { indexedHeight: undefined, chainHeight: undefined };
const controller = new AbortController();

const app = createApp({
  db,
  state,
  bus,
  risk: riskService({ db, chain: rpcChainReader(config.rpcUrl), registryId: config.registryId }),
  tokenDecimals: tokenDecimalsReader(config.rpcUrl),
  upgradeWebSocket,
});

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    // ws declares `options.noServer` as optional, which `exactOptionalPropertyTypes` rejects
    // against the structural type node-server expects; the runtime shape is identical.
    websocket: {
      server: new WebSocketServer({ noServer: true }) as unknown as WebSocketServerLike,
    },
  },
  (info) => logger.info({ port: info.port, network: config.network }, "api listening"),
);

const ingestion = run(
  {
    db,
    source: neardataSource({ baseUrl: config.neardataUrl, apiKey: config.neardataApiKey }),
    bus,
    logger,
    isTracked: trackedAccounts(config.factoryId, config.registryId),
    startBlock: config.startBlock,
    pollIntervalMs: config.pollIntervalMs,
  },
  state,
  controller.signal,
);

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  controller.abort();
  await ingestion;
  server.close();
  await sqlClient.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
