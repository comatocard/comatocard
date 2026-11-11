import {
  type ComatocardEvent,
  type FunctionCall,
  type PaymentDecision,
  type PaymentPreview,
  parseEventLog,
  paymentDecision,
  type RiskAssessment,
  type VaultClient,
  vaultCalls,
} from "@comatocard/sdk";
import { z } from "zod";
import type { Approve } from "./approve.js";
import type { Logger } from "./logger.js";
import type { RiskCheck } from "./risk.js";

export interface PaymentRequest {
  merchant: string;
  /** Smallest token unit. */
  amount: string;
  reference?: string;
}

/**
 * Signs and sends a call with the card key and waits for every receipt; returns the transaction
 * hash, the call result and the logs of all receipts.
 */
export type Submit = (
  call: FunctionCall,
) => Promise<{ txHash: string; result: unknown; logs: string[] }>;

/** What the vault decided and the Comatocard events the transaction emitted. */
export interface Sent {
  decision: PaymentDecision;
  events: ComatocardEvent[];
  txHash: string;
}

export type Refusal =
  | { by: "preview"; preview: Extract<PaymentPreview, { status: "rejected" }> }
  | { by: "risk_unavailable"; preview: PaymentPreview; error: string }
  | { by: "risk"; preview: PaymentPreview; risk: RiskAssessment }
  | { by: "human"; preview: PaymentPreview; risk: RiskAssessment };

export type SpendOutcome =
  | ({ kind: "refused" } & Refusal)
  | ({
      kind: "sent";
      preview: PaymentPreview;
      risk: RiskAssessment;
      approvedByHuman: boolean;
    } & Sent);

export interface SpendDeps {
  client: Pick<VaultClient, "vaultId" | "previewPayment">;
  publicKey: string;
  risk: RiskCheck;
  approve: Approve;
  submit: Submit;
  logger: Pick<Logger, "info" | "warn">;
}

/**
 * The agent-side guard, then the payment. Refuses what the vault would reject, refuses `block`
 * verdicts and an unreachable indexer, asks a human on `warn`. A payment that needs approval is
 * still sent: the vault queues it for the owner. Logs one `guard decision` per request.
 */
export async function spend(deps: SpendDeps, request: PaymentRequest): Promise<SpendOutcome> {
  const refuse = (refusal: Refusal): SpendOutcome => {
    deps.logger.warn({ ...request, ...guardFields(refusal), outcome: "refused" }, "guard decision");
    return { kind: "refused", ...refusal };
  };

  const preview = await deps.client.previewPayment(
    deps.publicKey,
    request.merchant,
    request.amount,
  );
  if (preview.status === "rejected") return refuse({ by: "preview", preview });

  let risk: RiskAssessment;
  try {
    risk = await deps.risk(request.merchant);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return refuse({ by: "risk_unavailable", preview, error: message });
  }
  if (risk.verdict === "block") return refuse({ by: "risk", preview, risk });
  const approvedByHuman = risk.verdict === "warn";
  if (approvedByHuman && !(await deps.approve(request, risk))) {
    return refuse({ by: "human", preview, risk });
  }
  deps.logger.info(
    { ...request, ...guardFields({ preview, risk }), outcome: "sign", approvedByHuman },
    "guard decision",
  );

  const sent = await sendPayment(deps.client.vaultId, deps.submit, request);
  return { kind: "sent", preview, risk, approvedByHuman, ...sent };
}

/** Signs `pay` without any check. The guard calls it last; the attack demo calls it directly. */
export async function sendPayment(
  vaultId: string,
  submit: Submit,
  request: PaymentRequest,
): Promise<Sent> {
  const call = vaultCalls(vaultId).pay({
    merchant: request.merchant,
    amount: request.amount,
    ...(request.reference === undefined ? {} : { reference: request.reference }),
  });
  const { txHash, result, logs } = await submit(call);
  const decision = paymentDecision.safeParse(result);
  if (!decision.success) {
    throw new Error(`pay ${txHash}: unexpected result\n${z.prettifyError(decision.error)}`);
  }
  const events = logs.flatMap((line) => {
    const parsed = parseEventLog(line);
    return parsed.ok ? [parsed.event] : [];
  });
  return { decision: decision.data, events, txHash };
}

function guardFields(input: {
  by?: string;
  preview: PaymentPreview;
  risk?: RiskAssessment;
  error?: string;
}) {
  return {
    refusedBy: input.by,
    preview: input.preview,
    verdict: input.risk?.verdict,
    reasons: input.risk?.reasons.map((r) => `${r.level}:${r.code}`),
    error: input.error,
  };
}
