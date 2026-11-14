import { pino } from "pino";

export type Logger = pino.Logger;

/** Logs JSON to stdout, or to `fd` (2 for stderr) when stdout carries a protocol. */
export function createLogger(level: string, agent: string, fd = 1): Logger {
  return pino({ level, base: { service: "comatocard-agents", agent } }, pino.destination(fd));
}
