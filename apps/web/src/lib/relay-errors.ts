/** Shown when the relayer cannot be reached at all. */
export const RELAYER_UNREACHABLE = "The relayer is not reachable.";

/** Shown when the relayer answered but did not return a result, for example an expired action. */
export const RELAYER_NOT_SENT = "The relayer could not send it. Sign it again.";

/**
 * Explains an answer from `/api/relay` that is not a typed relay result. Only the proxy's own
 * "relayer unreachable" means the relayer is down; anything else came from a relayer that is up.
 */
export function untypedRelayError(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  return error === "relayer unreachable" ? RELAYER_UNREACHABLE : RELAYER_NOT_SENT;
}
