"use client";

import { type FunctionCall, type RelayResponse, relayResponse } from "@comatocard/sdk";
import { useNearWallet } from "near-connect-hooks";
import { groupByReceiver, toConnectorAction } from "../lib/actions";

/** How an owner action reached the chain. */
export type OwnerResult =
  | { via: "relayer"; txHash: string }
  | { via: "wallet"; txHash: string | null };

/** The relayer refused or could not be reached; the owner may sign the same call directly. */
export class RelayError extends Error {
  override name = "RelayError";
  constructor(
    message: string,
    readonly response: RelayResponse | null,
  ) {
    super(message);
  }
}

function txHashOf(outcome: unknown): string | null {
  const hash = (outcome as { transaction?: { hash?: unknown } } | undefined)?.transaction?.hash;
  return typeof hash === "string" ? hash : null;
}

/**
 * Owner actions. `gasless` signs a NEP-366 delegate action in the wallet and the relayer pays the
 * gas; `direct` signs and sends a normal transaction from the owner. Owner methods attach no
 * deposit, which is what lets the relayer sponsor them.
 */
export function useOwnerCall() {
  const { connector, signedAccountId } = useNearWallet();

  const wallet = async () => (signedAccountId ? connector.wallet() : connector.connect());

  const gasless = async (call: FunctionCall): Promise<OwnerResult> => {
    const signed = await (await wallet()).signDelegateActions({
      delegateActions: [{ receiverId: call.receiverId, actions: [toConnectorAction(call)] }],
    });
    const delegate = signed.signedDelegateActions[0];
    if (!delegate) throw new RelayError("The wallet returned no signed action.", null);
    const response = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signed_delegate: delegate }),
    });
    const parsed = relayResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new RelayError("The relayer is not reachable.", null);
    const result = parsed.data;
    if (result.status === "refused") throw new RelayError(result.detail, result);
    if (result.failure !== null) throw new RelayError(result.failure, result);
    return { via: "relayer", txHash: result.tx_hash };
  };

  const direct = async (calls: FunctionCall[]): Promise<OwnerResult> => {
    const w = await wallet();
    const transactions = groupByReceiver(calls);
    if (transactions.length === 1 && transactions[0]) {
      const outcome = await w.signAndSendTransaction(transactions[0]);
      return { via: "wallet", txHash: txHashOf(outcome) };
    }
    const outcomes = await w.signAndSendTransactions({ transactions });
    return { via: "wallet", txHash: txHashOf(outcomes.at(-1)) };
  };

  return { gasless, direct, accountId: signedAccountId };
}
