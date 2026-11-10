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
  backoffMs?: number;
}

export class NeardataError extends Error {
  override name = "NeardataError";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** neardata.xyz client for finalized blocks, with bounded exponential backoff. */
export function neardataSource(options: NeardataOptions): BlockSource {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const maxAttempts = options.maxAttempts ?? 5;
  const backoffMs = options.backoffMs ?? 500;

  async function get(path: string): Promise<unknown> {
    const url = new URL(path, options.baseUrl);
    if (options.apiKey) url.searchParams.set("apiKey", options.apiKey);
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchFn(url, { headers: { accept: "application/json" } });
        if (response.ok) return await response.json();
        lastError = `${path} responded ${response.status}`;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new NeardataError(lastError);
      } catch (error) {
        if (error instanceof NeardataError) throw error;
        lastError = `${path}: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
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
