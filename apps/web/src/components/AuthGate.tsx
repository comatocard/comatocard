"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useSession } from "../hooks/useSession";

/** Screens behind a connected wallet. Waits for the wallet before deciding. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, accountId } = useSession();
  const allowed = accountId !== null;
  useEffect(() => {
    if (ready && !allowed) router.replace("/");
  }, [ready, allowed, router]);
  if (!ready || !allowed) return null;
  return <>{children}</>;
}
