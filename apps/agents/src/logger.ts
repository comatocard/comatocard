import { pino } from "pino";

export type Logger = pino.Logger;

export function createLogger(level: string, agent: string): Logger {
  return pino({ level, base: { service: "comatocard-agents", agent } });
}
