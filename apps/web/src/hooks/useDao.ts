"use client";
import { useQuery } from "@tanstack/react-query";
import { readDaoPolicy, readProposals } from "../lib/dao";

/** The owner's Sputnik DAO policy, or null when the owner is a plain account. */
export function useDaoPolicy(owner: string | null) {
  return useQuery({
    queryKey: ["dao", owner ?? "", "policy"],
    queryFn: () => readDaoPolicy(owner ?? ""),
    enabled: Boolean(owner),
    staleTime: 5 * 60_000,
  });
}

export function useDaoProposals(dao: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["dao", dao ?? "", "proposals"],
    queryFn: () => readProposals(dao ?? ""),
    enabled: Boolean(dao) && enabled,
    refetchInterval: 15_000,
  });
}
