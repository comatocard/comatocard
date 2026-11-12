"use client";

import { useNearWallet } from "near-connect-hooks";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { readStored, STORAGE, writeStored } from "../lib/storage";

interface VaultContextValue {
  /** The vault the connected account is looking at, or null before one is chosen. */
  vaultId: string | null;
  /** False until the remembered vault of this account has been read. */
  hydrated: boolean;
  setVaultId: (vault: string | null) => void;
}

export const VaultContext = createContext<VaultContextValue>({
  vaultId: null,
  hydrated: false,
  setVaultId: () => undefined,
});

/**
 * The selected vault, remembered per account on this device (a convenience, not state). Switching
 * wallets never carries one account's vault over to another.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const { signedAccountId } = useNearWallet();
  const account = signedAccountId || null;
  const [vaultId, setVault] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVault(account ? readStored(STORAGE.vault(account)) : null);
    setHydrated(true);
  }, [account]);

  const setVaultId = useCallback(
    (vault: string | null) => {
      setVault(vault);
      if (account) writeStored(STORAGE.vault(account), vault);
    },
    [account],
  );
  const value = useMemo(() => ({ vaultId, hydrated, setVaultId }), [vaultId, hydrated, setVaultId]);
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
