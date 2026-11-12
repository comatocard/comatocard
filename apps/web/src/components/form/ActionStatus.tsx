"use client";
import type { ActionState } from "../../hooks/useOwnerAction";

/** The line under an action button: signing, done (with the transaction), or what went wrong. */
export function ActionStatus({ state, onDirect }: { state: ActionState; onDirect?: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "signing" || state.status === "confirming") {
    return <p className="mt-3 text-center text-[13px] text-muted">Confirm in your wallet…</p>;
  }
  if (state.status === "confirmed") {
    return (
      <p className="mt-3 text-center text-[13px] text-pos">
        Done{state.via === "relayer" ? ", no gas from you" : ""}.{" "}
        {state.href ? (
          <a href={state.href} target="_blank" rel="noreferrer" className="underline">
            View transaction
          </a>
        ) : null}
      </p>
    );
  }
  if (state.relayRefused !== null) {
    return (
      <div className="mt-3 text-center text-[13px]">
        <p className="text-neg">The relayer did not send it: {state.relayRefused}</p>
        {onDirect ? (
          <button type="button" onClick={onDirect} className="mt-1.5 font-semibold underline">
            Sign it from your wallet instead
          </button>
        ) : null}
      </div>
    );
  }
  return <p className="mt-3 text-center text-[13px] text-neg">{state.error}</p>;
}
