import { type RelayRefusal, type RelayResponse, relayRequest } from "@comatocard/sdk";
import {
  DelegateActionExpiredActionError,
  DelegateActionInvalidNonceActionError,
} from "near-api-js/rpc-errors";
import { type AuthorizeDeps, authorize } from "./authorize.js";
import { type Delegate, decodeDelegate } from "./delegate.js";
import { checkDelegate } from "./policy.js";

export interface RelayDeps extends AuthorizeDeps {
  factoryId: string;
  /** Height of the latest final block, to refuse an expired delegate without spending gas. */
  finalHeight: () => Promise<bigint>;
  /** Wraps the delegate in a transaction signed and paid by the relayer account. */
  send: (delegate: Delegate) => Promise<{ txHash: string; failure: string | null }>;
  logger: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}

/** Validates one relay request and sponsors it only when every check passes. */
export async function relay(deps: RelayDeps, body: unknown): Promise<RelayResponse> {
  const request = relayRequest.safeParse(body);
  if (!request.success) {
    return {
      status: "refused",
      reason: "malformed",
      detail: "expected { signed_delegate: <base64> }",
    };
  }
  let delegate: Delegate;
  try {
    delegate = decodeDelegate(request.data.signed_delegate);
  } catch {
    return { status: "refused", reason: "malformed", detail: "not a borsh SignedDelegate" };
  }
  const context = {
    sender: delegate.senderId,
    vault: delegate.receiverId,
    methods: delegate.calls.map((c) => c?.methodName ?? null),
  };
  const check = checkDelegate(delegate, deps.factoryId);
  const authorized = check.ok ? await authorize(deps, delegate) : check;
  if (!authorized.ok) {
    deps.logger.warn(
      { ...context, reason: authorized.reason, detail: authorized.detail },
      "relay refused",
    );
    return { status: "refused", reason: authorized.reason, detail: authorized.detail };
  }
  if (delegate.maxBlockHeight <= (await deps.finalHeight())) {
    return refuse(deps, context, "expired");
  }
  try {
    const { txHash, failure } = await deps.send(delegate);
    deps.logger.info({ ...context, txHash, failure }, "relayed");
    return { status: "relayed", tx_hash: txHash, failure };
  } catch (error) {
    // The chain rejects the outer transaction when the delegate expired on the way or its nonce
    // is spent; the delegated call never ran, so the owner only has to sign again.
    if (error instanceof DelegateActionExpiredActionError) return refuse(deps, context, "expired");
    if (error instanceof DelegateActionInvalidNonceActionError) {
      return refuse(deps, context, "nonce_used");
    }
    throw error;
  }
}

const RETRY_DETAIL: Record<"expired" | "nonce_used", string> = {
  expired: "The signed action expired before it was sent. Sign it again.",
  nonce_used: "The signed action was already used or replaced by a newer one. Sign it again.",
};

function refuse(
  deps: Pick<RelayDeps, "logger">,
  context: object,
  reason: Extract<RelayRefusal, "expired" | "nonce_used">,
): RelayResponse {
  const detail = RETRY_DETAIL[reason];
  deps.logger.warn({ ...context, reason, detail }, "relay refused");
  return { status: "refused", reason, detail };
}
