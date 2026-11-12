"use client";
import { useVaultConfig } from "./data";
import { useSession } from "./useSession";

/** Whether the connected wallet owns the vault, which every owner action requires. */
export function useOwnership(vault: string | null) {
  const { accountId } = useSession();
  const config = useVaultConfig(vault);
  const owner = config.data?.owner ?? null;
  return { owner, isOwner: accountId !== null && owner === accountId, accountId, config };
}
