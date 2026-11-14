import { pino } from "pino";
import { createAssistantDeps } from "./assistant.js";
import { loadAssistantConfig } from "./config.js";
import { createAssistantServer } from "./server.js";

// The policy assistant as its own service: it holds the NEAR AI key and never the relayer key.

const config = loadAssistantConfig(process.env);
const logger = pino({ level: config.logLevel, base: { service: "comatocard-assistant" } });
const server = createAssistantServer(
  createAssistantDeps({
    factoryId: config.factoryId,
    rpcUrl: config.rpcUrl,
    nearAi: config.nearAi,
    logger,
  }),
);

server.listen(config.port, () => {
  logger.info({ port: config.port, model: config.nearAi.model }, "assistant listening");
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
