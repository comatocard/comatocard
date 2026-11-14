import { createVaultClient } from "@comatocard/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMcpServer } from "./mcp-tools.js";
import { indexerRisk } from "./risk.js";
import { cardSubmitter } from "./submit.js";

// stdout carries the MCP protocol, so logs go to stderr.
const config = loadConfig(process.env);
const logger = createLogger(config.logLevel, "mcp", 2);
const server = createMcpServer(
  {
    client: createVaultClient({ rpcUrl: config.rpcUrl, vaultId: config.vaultId }),
    publicKey: config.cardKey.getPublicKey().toString(),
    indexerUrl: config.indexerUrl,
    risk: indexerRisk({ indexerUrl: config.indexerUrl, vaultId: config.vaultId }),
    submit: cardSubmitter(config),
    logger,
  },
  "0.1.0",
);
await server.connect(new StdioServerTransport());
logger.info({ vaultId: config.vaultId, network: config.network }, "mcp server ready");
