import { type Block, blockSchema } from "./types.js";

/** Where blocks come from: neardata in production, recorded fixtures in tests. */
export interface BlockSource {
  /** Height of the latest final block. */
  finalHeight(): Promise<number>;
  /** The final block at `height`, or `null` when no block was produced at that height. */
  block(height: number): Promise<Block | null>;
}

export interface NeardataOptions {
  baseUrl: string;
  apiKey?: string | undefined;
  fetch?: typeof globalThis.fetch;
  /** Attempts per request for rate limits, server errors and network failures. */
  maxAttempts?: number;
  /** First retry delay; it doubles per attempt up to `maxBackoffMs`. */
  backoffMs?: number;
  maxBackoffMs?: number;
  /**
   * Minimum time between requests. Defaults to 350 ms without an API key, which stays below the
   * free tier limit of 180 requests per minute, and to 0 with a key.
   */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Aborts pending waits and retries, so shutdown does not wait for a backoff to finish. */
  signal?: AbortSignal;
  /** Called before each retry, for logging. */
  onRetry?: (retry: { path: string; attempt: number; delayMs: number; reason: string }) => void;
}

/** Free tier: 180 requests per minute per IP. */
export const FREE_TIER_INTERVAL_MS = 350;
/** Longest `Retry-After` the client waits for. */
export const MAX_RETRY_AFTER_MS = 60_000;

export class NeardataError extends Error {
  override name = "NeardataError";
}

/** Waits `ms`, or less when `signal` aborts first. */
function abortableSleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Parses `Retry-After` given in seconds; HTTP dates are treated as absent. */
export function retryAfterMs(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Math.min(Number(header.trim()) * 1_000, MAX_RETRY_AFTER_MS);
}

/**
 * neardata.xyz client for finalized blocks. Requests are paced to the free tier limit without an
 * API key, and transient failures back off exponentially; on 429 a longer `Retry-After` wins.
 */
export function neardataSource(options: NeardataOptions): BlockSource {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => abortableSleep(ms, options.signal));
  const now = options.now ?? Date.now;
  const maxAttempts = options.maxAttempts ?? 8;
  const backoffMs = options.backoffMs ?? 1_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const minIntervalMs = options.minIntervalMs ?? (options.apiKey ? 0 : FREE_TIER_INTERVAL_MS);

  // Requests reserve start times in order, so concurrent callers are paced too.
  let nextSlot = 0;
  async function paced<T>(request: () => Promise<T>): Promise<T> {
    const start = Math.max(now(), nextSlot);
    nextSlot = start + minIntervalMs;
    const wait = start - now();
    if (wait > 0) await sleep(wait);
    return request();
  }

  async function get(path: string): Promise<unknown> {
    const url = new URL(path, options.baseUrl);
    if (options.apiKey) url.searchParams.set("apiKey", options.apiKey);
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (options.signal?.aborted) throw new NeardataError(`${path}: aborted`);
      let delay = Math.min(backoffMs * 2 ** (attempt - 1), maxBackoffMs);
      try {
        const response = await paced(() =>
          fetchFn(url, { headers: { accept: "application/json" } }),
        );
        if (response.ok) return await response.json();
        lastError = `${path} responded ${response.status}`;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new NeardataError(lastError);
        if (response.status === 429) {
          // Cloudflare in front of neardata sends `Retry-After: 0` while the limit is still
          // active, so the header only raises the backoff, it never shortens it.
          delay = Math.max(delay, retryAfterMs(response.headers.get("retry-after")) ?? 0);
        }
      } catch (error) {
        if (error instanceof NeardataError) throw error;
        lastError = `${path}: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (attempt < maxAttempts) {
        options.onRetry?.({ path, attempt, delayMs: delay, reason: lastError });
        await sleep(delay);
      }
    }
    throw new NeardataError(`${lastError} after ${maxAttempts} attempts`);
  }

  return {
    async finalHeight() {
      const block = blockSchema.parse(await get("/v0/last_block/final"));
      return block.block.header.height;
    },
    async block(height) {
      const body = await get(`/v0/block/${height}`);
      return body === null ? null : blockSchema.parse(body);
    },
  };
}
