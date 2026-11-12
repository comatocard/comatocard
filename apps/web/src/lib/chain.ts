import { type AccountId, accountId, createVaultClient, u128, viewFunction } from "@comatocard/sdk";
import { z } from "zod";
import { RPC_URL } from "./config";

/** Read access to one vault over RPC. Views are authoritative for balances and live spend. */
export const vaultClient = (vaultId: AccountId) => createVaultClient({ rpcUrl: RPC_URL, vaultId });

const ftMetadata = z.object({ symbol: z.string(), decimals: z.number().int().min(0).max(36) });
export type TokenMetadata = z.infer<typeof ftMetadata>;

export const tokenMetadata = (token: AccountId): Promise<TokenMetadata> =>
  viewFunction({ rpcUrl: RPC_URL }, token, "ft_metadata", {}, ftMetadata);

export const tokenBalanceOf = (token: AccountId, account: AccountId): Promise<string> =>
  viewFunction({ rpcUrl: RPC_URL }, token, "ft_balance_of", { account_id: account }, u128);

const storageBalance = z.object({ total: u128 }).nullable();

/** Whether an account is registered with a NEP-141 token (NEP-145 storage). */
export const isRegistered = async (token: AccountId, account: AccountId): Promise<boolean> =>
  (await viewFunction(
    { rpcUrl: RPC_URL },
    token,
    "storage_balance_of",
    { account_id: account },
    storageBalance,
  )) !== null;

const rpcAccount = z.object({ result: z.object({ amount: z.string() }).optional() });

/** Whether a NEAR account exists, used before offering a vault name. */
export async function accountExists(account: string): Promise<boolean> {
  if (!accountId.safeParse(account).success) return false;
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "comatocard",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: account },
    }),
  });
  const body = rpcAccount.safeParse(await response.json());
  return body.success && body.data.result !== undefined;
}
