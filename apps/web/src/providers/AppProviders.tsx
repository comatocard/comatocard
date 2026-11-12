"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { type ReactNode, useState } from "react";
import { NETWORK } from "../lib/config";
import { VaultProvider } from "./VaultProvider";

// Wallet libraries need browser APIs, so the provider loads after hydration.
const NearProvider = dynamic(() => import("near-connect-hooks").then((m) => m.NearProvider), {
  ssr: false,
});

// Outside the component so the provider receives a stable config object.
const nearConfig = { network: NETWORK };

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <NearProvider config={nearConfig}>
        <VaultProvider>{children}</VaultProvider>
      </NearProvider>
    </QueryClientProvider>
  );
}
