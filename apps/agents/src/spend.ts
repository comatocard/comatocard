import {
  type FunctionCall,
  type PaymentDecision,
  type PaymentPreview,
  paymentDecision,
  type VaultClient,
  vaultCalls,
} from "@comatocard/sdk";
import { z } from "zod";

export interface PaymentRequest {
  merchant: string;
  /** Smallest token unit. */
  amount: string;
  reference?: string;
}

/** Signs and sends a call with the card key; returns the transaction hash and the call result. */
export type Submit = (call: FunctionCall) => Promise<{ txHash: string; result: unknown }>;

export type SpendOutcome =
  | { kind: "refused"; preview: Extract<PaymentPreview, { status: "rejected" }> }
  | { kind: "sent"; preview: PaymentPreview; decision: PaymentDecision; txHash: string };

/**
 * Previews the payment and signs `pay` only when the vault would not reject it. A payment that
 * needs approval is still sent: the vault queues it for the owner.
 */
export async function spend(
  deps: {
    client: Pick<VaultClient, "vaultId" | "previewPayment">;
    publicKey: string;
    submit: Submit;
  },
  request: PaymentRequest,
): Promise<SpendOutcome> {
  const preview = await deps.client.previewPayment(
    deps.publicKey,
    request.merchant,
    request.amount,
  );
  if (preview.status === "rejected") return { kind: "refused", preview };
  const call = vaultCalls(deps.client.vaultId).pay({
    merchant: request.merchant,
    amount: request.amount,
    ...(request.reference === undefined ? {} : { reference: request.reference }),
  });
  const { txHash, result } = await deps.submit(call);
  const decision = paymentDecision.safeParse(result);
  if (!decision.success) {
    throw new Error(`pay ${txHash}: unexpected result\n${z.prettifyError(decision.error)}`);
  }
  return { kind: "sent", preview, decision: decision.data, txHash };
}
