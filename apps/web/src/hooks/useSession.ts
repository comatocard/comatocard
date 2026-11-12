"use client";

import { useNearWallet } from "near-connect-hooks";
import { useVault } from "./useVault";

/** The connected wallet. Every screen behind onboarding needs one. */
export function useSession() {
  const { signedAccountId, loading, signIn, signOut } = useNearWallet();
  const { hydrated } = useVault();
  return { ready: !loading && hydrated, accountId: signedAccountId || null, signIn, signOut };
}

/** Ends the visit: disconnects the wallet. The account's vault stays remembered for next time. */
export function useSignOut() {
  const { signOut } = useNearWallet();
  return async () => {
    await signOut().catch(() => undefined);
  };
}

/** A NEAR account for display: named accounts in full, implicit ones shortened. */
export const shortAccount = (account: string) =>
  account.length > 24 ? `${account.slice(0, 6)}…${account.slice(-6)}` : account;
