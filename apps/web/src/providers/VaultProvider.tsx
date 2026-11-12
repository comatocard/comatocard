"use client";

import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { readStored, STORAGE, writeStored } from "../lib/storage";

interface VaultContextValue {
  /** The vault the owner is looking at, or null before one is chosen. */
  vaultId: string | null;
  /** False until the remembered vault has been read, so a reload never bounces to onboarding. */
  hydrated: boolean;
  setVaultId: (vault: string | null) => void;
}

export const VaultContext = createContext<VaultContextValue>({
  vaultId: null,
  hydrated: false,
  setVaultId: () => undefined,
});

/** The selected vault, remembered on this device only (a convenience, not state). */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [vaultId, setVault] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setVault(readStored(STORAGE.vault));
    setHydrated(true);
  }, []);
  const setVaultId = useCallback((vault: string | null) => {
    setVault(vault);
    writeStored(STORAGE.vault, vault);
  }, []);
  const value = useMemo(() => ({ vaultId, hydrated, setVaultId }), [vaultId, hydrated, setVaultId]);
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
