"use client";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useOwnerVaults, useVaultConfig } from "../hooks/data";
import { useSession } from "../hooks/useSession";
import { useVault } from "../hooks/useVault";
import { Skeleton } from "./ui";

const SETUP = "/setup";

/**
 * Keeps the app on a vault the connected account owns. A remembered vault owned by someone else
 * is dropped; without one, the account's first vault opens; an account with none goes to setup.
 */
export function VaultGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accountId } = useSession();
  const { vaultId, setVaultId } = useVault();
  const config = useVaultConfig(vaultId);
  const owned = useOwnerVaults(vaultId ? null : accountId);
  const foreign = Boolean(vaultId && config.data && config.data.owner !== accountId);
  const first = owned.data?.[0]?.vault_id ?? null;
  const noVault = !vaultId && (owned.isError || (owned.isSuccess && first === null));

  useEffect(() => {
    if (foreign) setVaultId(null);
  }, [foreign, setVaultId]);
  useEffect(() => {
    if (!vaultId && first) setVaultId(first);
  }, [vaultId, first, setVaultId]);
  useEffect(() => {
    if (noVault && pathname !== SETUP) router.replace(SETUP);
  }, [noVault, pathname, router]);

  if (pathname === SETUP) return <>{children}</>;
  if (!vaultId || foreign || config.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <Skeleton className="mx-auto h-10 w-40 rounded-full" />
        <Skeleton className="mt-8 h-14 w-48" />
        <Skeleton className="mt-8 aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
      </div>
    );
  }
  return <>{children}</>;
}
