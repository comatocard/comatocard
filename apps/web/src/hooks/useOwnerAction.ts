"use client";

import type { FunctionCall } from "@comatocard/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { txUrl } from "../lib/config";
import { refreshUntilSettled } from "../lib/settle";
import { RelayError, useOwnerCall } from "./useOwnerCall";

export type TxStatus = "signing" | "confirming" | "confirmed" | "failed";

export interface ActionState {
  status: TxStatus | "idle";
  /** Set when the relayer refused, so the owner can choose to sign it directly instead. */
  relayRefused: string | null;
  error: string | null;
  href: string | null;
  via: "relayer" | "wallet" | null;
}

const IDLE: ActionState = {
  status: "idle",
  relayRefused: null,
  error: null,
  href: null,
  via: null,
};

const message = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "The wallet did not sign.";

/**
 * Runs owner actions and tracks their status. Owner methods go gasless through the relayer first;
 * if it refuses or is down, `direct()` signs the same call from the owner's wallet. Every vault
 * query is refreshed when the action lands and again until the change is final.
 */
export function useOwnerAction(vault: string | null) {
  const { gasless, direct } = useOwnerCall();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ActionState>(IDLE);
  const [pending, setPending] = useState<FunctionCall[] | null>(null);
  const stopRefresh = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRefresh.current?.(), []);

  const done = useCallback(
    (via: "relayer" | "wallet", hash: string | null) => {
      setState({ ...IDLE, status: "confirmed", via, href: hash ? txUrl(hash) : null });
      setPending(null);
      if (!vault) return;
      stopRefresh.current?.();
      stopRefresh.current = refreshUntilSettled(() => {
        void queryClient.invalidateQueries({ queryKey: ["vault", vault] });
      });
    },
    [queryClient, vault],
  );

  /** One owner method, gasless. */
  const run = async (call: FunctionCall) => {
    setPending([call]);
    setState({ ...IDLE, status: "signing" });
    try {
      const result = await gasless(call);
      done(result.via, result.txHash);
      return true;
    } catch (error) {
      if (error instanceof RelayError) {
        setState({ ...IDLE, status: "failed", relayRefused: error.message });
      } else {
        setState({ ...IDLE, status: "failed", error: message(error) });
      }
      return false;
    }
  };

  /** Calls signed and paid by the owner: the fallback, and calls that attach a deposit. */
  const runDirect = async (calls?: FunctionCall[]) => {
    const toSend = calls ?? pending;
    if (!toSend) return false;
    setPending(toSend);
    setState({ ...IDLE, status: "signing" });
    try {
      const result = await direct(toSend);
      done(result.via, result.txHash);
      return true;
    } catch (error) {
      setState({ ...IDLE, status: "failed", error: message(error) });
      return false;
    }
  };

  const reset = () => {
    setState(IDLE);
    setPending(null);
  };

  return { state, run, runDirect, reset };
}
