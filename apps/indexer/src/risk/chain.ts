import { z } from "zod";

/** Account facts read from NEAR RPC. */
export interface ChainAccount {
  exists: boolean;
  codeHash: string | null;
}

/** Reads account facts; `null` means the lookup failed. */
export type ChainReader = (accountId: string) => Promise<ChainAccount | null>;

const EMPTY_CODE_HASH = "11111111111111111111111111111111";

const response = z.object({
  result: z.object({ code_hash: z.string() }).optional(),
  error: z
    .object({ cause: z.object({ name: z.string() }).optional() })
    .loose()
    .optional(),
});

/** `view_account` over JSON-RPC. Unknown accounts resolve to `exists: false`. */
export function rpcChainReader(rpcUrl: string, fetchFn = globalThis.fetch): ChainReader {
  return async (accountId) => {
    try {
      const res = await fetchFn(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "comatocard-indexer",
          method: "query",
          params: { request_type: "view_account", finality: "final", account_id: accountId },
        }),
      });
      if (!res.ok) return null;
      const body = response.parse(await res.json());
      if (body.error?.cause?.name === "UNKNOWN_ACCOUNT") return { exists: false, codeHash: null };
      if (!body.result) return null;
      const codeHash = body.result.code_hash === EMPTY_CODE_HASH ? null : body.result.code_hash;
      return { exists: true, codeHash };
    } catch {
      return null;
    }
  };
}
