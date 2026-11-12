import { type RelayResponse, relayRequest } from "@comatocard/sdk";
import { type AuthorizeDeps, authorize } from "./authorize.js";
import { type Delegate, decodeDelegate } from "./delegate.js";
import { checkDelegate } from "./policy.js";

export interface RelayDeps extends AuthorizeDeps {
  factoryId: string;
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
  const { txHash, failure } = await deps.send(delegate);
  deps.logger.info({ ...context, txHash, failure }, "relayed");
  return { status: "relayed", tx_hash: txHash, failure };
}
