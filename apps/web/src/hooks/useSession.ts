"use client";

import { useNearWallet } from "near-connect-hooks";
import { useVault } from "./useVault";

/**
 * Who is looking. `accountId` is the connected wallet; without one, a visitor can still open a
 * vault read only (`guest`), and every owner action then asks for a wallet first.
 */
export function useSession() {
  const { signedAccountId, loading, signIn, signOut } = useNearWallet();
  const { vaultId, hydrated } = useVault();
  const accountId = signedAccountId || null;
  return {
    ready: !loading && hydrated,
    accountId,
    guest: accountId === null && vaultId !== null,
    signIn,
    signOut,
  };
}

/** Ends the visit: disconnects the wallet and forgets the opened vault on this device. */
export function useSignOut() {
  const { signOut } = useNearWallet();
  const { setVaultId } = useVault();
  return async () => {
    await signOut().catch(() => undefined);
    setVaultId(null);
  };
}

/** A NEAR account for display: named accounts in full, implicit ones shortened. */
export const shortAccount = (account: string) =>
  account.length > 24 ? `${account.slice(0, 6)}…${account.slice(-6)}` : account;
