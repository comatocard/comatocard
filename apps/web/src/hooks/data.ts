"use client";

import {
  type Approver,
  type Card,
  type Payment,
  paymentPage,
  type TokenBalance,
  vaultRow,
} from "@comatocard/sdk";
import { useQuery } from "@tanstack/react-query";
import { tokenMetadata, vaultClient } from "../lib/chain";
import { TOKEN_ID } from "../lib/config";
import { indexerGet } from "../lib/indexer";

/** Query keys, one place, so a live event can refresh exactly what it changed. */
export const keys = {
  vaults: (owner: string) => ["vaults", owner] as const,
  vault: (vault: string) => ["vault", vault] as const,
  config: (vault: string) => ["vault", vault, "config"] as const,
  balances: (vault: string) => ["vault", vault, "balances"] as const,
  cards: (vault: string) => ["vault", vault, "cards"] as const,
  payments: (vault: string, card?: number) => ["vault", vault, "payments", card ?? "all"] as const,
  approvals: (vault: string) => ["vault", vault, "approvals"] as const,
  token: (token: string) => ["token", token] as const,
};

export function useOwnerVaults(owner: string | null | undefined) {
  return useQuery({
    queryKey: keys.vaults(owner ?? ""),
    queryFn: () => indexerGet("vaults", vaultRow.array(), { owner: owner ?? undefined }),
    enabled: Boolean(owner),
  });
}

export function useVaultConfig(vault: string | null) {
  return useQuery({
    queryKey: keys.config(vault ?? ""),
    queryFn: () => vaultClient(vault ?? "").getConfig(),
    enabled: Boolean(vault),
    staleTime: 60_000,
  });
}

export function useBalances(vault: string | null) {
  return useQuery({
    queryKey: keys.balances(vault ?? ""),
    queryFn: () => vaultClient(vault ?? "").getBalances(),
    enabled: Boolean(vault),
    refetchInterval: 15_000,
  });
}

/** The settlement token's balance in a vault; null while unread. */
export const tokenBalance = (balances: TokenBalance[] | undefined, token = TOKEN_ID) =>
  balances?.find((b) => b.token === token) ?? null;

/** Every card with its live spend, from the vault view (the indexer has no spend counters). */
export function useCards(vault: string | null) {
  return useQuery({
    queryKey: keys.cards(vault ?? ""),
    queryFn: async () => {
      const client = vaultClient(vault ?? "");
      const cards: Card[] = [];
      // Pages of 50 until a short page; a vault rarely has more than a handful of cards.
      for (let from = 0; ; from += 50) {
        const page = await client.listCards({ fromIndex: from, limit: 50 });
        cards.push(...page);
        if (page.length < 50) return cards;
      }
    },
    enabled: Boolean(vault),
    refetchInterval: 15_000,
  });
}

export function usePayments(vault: string | null, card?: number) {
  return useQuery({
    queryKey: keys.payments(vault ?? "", card),
    queryFn: () =>
      indexerGet(`vaults/${vault}/payments`, paymentPage, {
        card: card === undefined ? undefined : String(card),
        limit: "50",
      }),
    enabled: Boolean(vault),
  });
}

/**
 * Payments waiting for a decision, read from the vault itself: the contract is the source of
 * truth for its queue, so it is complete even when the indexer started after a payment queued.
 */
export function useApprovals(vault: string | null) {
  return useQuery({
    queryKey: keys.approvals(vault ?? ""),
    queryFn: async (): Promise<{ items: Payment[]; approvers: Approver[] }> => {
      const client = vaultClient(vault ?? "");
      const [payments, approvers] = await Promise.all([
        client.listPayments({ limit: 100 }),
        client.listApprovers(),
      ]);
      return { items: payments.filter((p) => p.status === "queued"), approvers };
    },
    enabled: Boolean(vault),
    refetchInterval: 20_000,
  });
}

export function useToken(token = TOKEN_ID) {
  return useQuery({
    queryKey: keys.token(token),
    queryFn: () => tokenMetadata(token),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
