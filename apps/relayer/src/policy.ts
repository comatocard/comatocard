import type { RelayRefusal } from "@comatocard/sdk";
import { type Delegate, hasValidSignature } from "./delegate.js";

/** Owner methods of `docs/specs/vault-contract.md` that the relayer sponsors. `pay` never is. */
export const RELAYED_METHODS = new Set([
  "create_card",
  "update_policy",
  "freeze_card",
  "unfreeze_card",
  "revoke_card",
  "rotate_card_key",
  "set_approver",
  "approve_payment",
  "decline_payment",
  "withdraw",
  "set_accepted_token",
  "set_registry",
  "set_approval_ttl",
]);

/** Methods an approver may call besides the owner. */
export const APPROVER_METHODS = new Set(["approve_payment", "decline_payment"]);

export type Check = { ok: true } | { ok: false; reason: RelayRefusal; detail: string };

const refuse = (reason: RelayRefusal, detail: string): Check => ({ ok: false, reason, detail });

/**
 * Checks that need no network: a factory vault receiver, only allowlisted function calls with
 * zero deposit, and a valid signature.
 */
export function checkDelegate(delegate: Delegate, factoryId: string): Check {
  const vault = delegate.receiverId;
  const name = vault.slice(0, -(factoryId.length + 1));
  if (!vault.endsWith(`.${factoryId}`) || name.length === 0 || name.includes(".")) {
    return refuse("not_a_vault", `${vault} is not a vault of ${factoryId}`);
  }
  if (delegate.calls.length === 0) return refuse("action_not_allowed", "no actions");
  for (const call of delegate.calls) {
    if (call === null) return refuse("action_not_allowed", "only function calls are relayed");
    if (!RELAYED_METHODS.has(call.methodName)) {
      return refuse("method_not_allowed", `${call.methodName} is not a relayed owner method`);
    }
    if (call.deposit !== 0n)
      return refuse("deposit_not_zero", `${call.methodName} attaches a deposit`);
  }
  if (!hasValidSignature(delegate)) return refuse("bad_signature", "signature does not match");
  return { ok: true };
}
