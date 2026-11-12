import type { RiskAssessment, VaultConfig } from "@comatocard/sdk";
import type { Delegate, DelegatedCall } from "./delegate.js";
import { APPROVER_METHODS, type Check } from "./policy.js";

export interface AuthorizeDeps {
  /** Vault config and approvers, read from the chain. */
  vault: (vaultId: string) => Promise<{ config: VaultConfig; approvers: string[] }>;
  /** Indexer counterparty verdict for a `withdraw` receiver. */
  risk: (accountId: string, vaultId: string) => Promise<RiskAssessment>;
}

const OK: Check = { ok: true };

/**
 * Checks that need the chain or the indexer: the sender may call every method (the owner, or an
 * approver for approvals only), and no `withdraw` pays a blocked account. Fails closed.
 */
export async function authorize(deps: AuthorizeDeps, delegate: Delegate): Promise<Check> {
  const vaultId = delegate.receiverId;
  const { config, approvers } = await deps.vault(vaultId);
  const sender = delegate.senderId;
  for (const call of delegate.calls) {
    if (call === null) continue;
    const mayCall =
      sender === config.owner ||
      (APPROVER_METHODS.has(call.methodName) && approvers.includes(sender));
    if (!mayCall) {
      return {
        ok: false,
        reason: "not_authorized",
        detail: `${sender} may not call ${call.methodName} on ${vaultId}`,
      };
    }
    const screened =
      call.methodName === "withdraw" ? await screenWithdraw(deps, call, vaultId) : OK;
    if (!screened.ok) return screened;
  }
  return OK;
}

/** Refuses a withdrawal to an account the indexer blocks, or when it cannot tell. */
async function screenWithdraw(
  deps: AuthorizeDeps,
  call: DelegatedCall,
  vaultId: string,
): Promise<Check> {
  const receiver = (call.args as { receiver_id?: unknown } | undefined)?.receiver_id;
  if (typeof receiver !== "string") {
    return { ok: false, reason: "malformed", detail: "withdraw without receiver_id" };
  }
  let verdict: RiskAssessment;
  try {
    verdict = await deps.risk(receiver, vaultId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "risk_unavailable", detail: message };
  }
  if (verdict.verdict !== "block") return OK;
  const codes = verdict.reasons.map((r) => r.code).join(", ");
  return { ok: false, reason: "receiver_blocked", detail: `${receiver}: ${codes}` };
}
