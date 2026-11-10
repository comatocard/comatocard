import { viewFunction } from "@comatocard/sdk";
import { z } from "zod";

const metadata = z.object({ decimals: z.number().int().min(0).max(36) }).loose();

/** Reads NEP-148 decimals once per token; `undefined` when the token cannot be read. */
export function tokenDecimalsReader(rpcUrl: string, fetchFn = globalThis.fetch) {
  const cache = new Map<string, Promise<number | undefined>>();
  return (token: string): Promise<number | undefined> => {
    let pending = cache.get(token);
    if (!pending) {
      pending = viewFunction({ rpcUrl, fetch: fetchFn }, token, "ft_metadata", {}, metadata).then(
        (m) => m.decimals,
        () => {
          cache.delete(token);
          return undefined;
        },
      );
      cache.set(token, pending);
    }
    return pending;
  };
}
