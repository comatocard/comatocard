"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useSession } from "../hooks/useSession";

/** Screens behind a wallet or an opened vault. Waits for the wallet before deciding. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, accountId, guest } = useSession();
  const allowed = accountId !== null || guest;
  useEffect(() => {
    if (ready && !allowed) router.replace("/");
  }, [ready, allowed, router]);
  if (!ready || !allowed) return null;
  return <>{children}</>;
}
