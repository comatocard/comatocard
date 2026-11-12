"use client";
import { type Card, type Policy, vaultCalls } from "@comatocard/sdk";
import { useState } from "react";
import { useToken } from "../../hooks/data";
import { useOwnerAction } from "../../hooks/useOwnerAction";
import { fromPolicy, type PolicyForm, toPolicy } from "../../lib/policy-form";
import { ActionStatus } from "../form/ActionStatus";
import { PolicyFields } from "../form/PolicyFields";
import { BottomSheet, Button } from "../ui";
import { PolicyDiff } from "./PolicyDiff";

/** Replaces a card's policy; spend counters are kept. Shows what changes before signing. */
export function EditPolicySheet({
  open,
  onClose,
  vault,
  card,
}: {
  open: boolean;
  onClose: () => void;
  vault: string;
  card: Card;
}) {
  const token = useToken();
  const decimals = token.data?.decimals ?? 0;
  const [form, setForm] = useState<PolicyForm>(() => fromPolicy(card.policy, decimals));
  const [error, setError] = useState<{ field: keyof PolicyForm; message: string } | null>(null);
  const { state, run, runDirect, reset } = useOwnerAction(vault);

  const parsed = toPolicy(form, {
    token: card.policy.token,
    decimals,
    validFrom: card.policy.valid_from,
  });
  const next: Policy | null = parsed.ok ? parsed.policy : null;

  const submit = async () => {
    if (!parsed.ok) {
      setError({ field: parsed.field, message: parsed.message });
      return;
    }
    setError(null);
    await run(vaultCalls(vault).updatePolicy(card.id, parsed.policy));
  };

  const close = () => {
    reset();
    setForm(fromPolicy(card.policy, decimals));
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} label="Edit limits">
      <h2 className="mb-1 text-xl font-semibold">Edit limits</h2>
      <p className="mb-5 text-sm text-muted">
        The new policy applies to the next payment. What {card.label} spent today still counts.
      </p>
      <PolicyFields
        form={form}
        onChange={setForm}
        symbol={token.data?.symbol ?? ""}
        error={error}
      />
      {next ? (
        <div className="mt-5">
          <PolicyDiff
            before={card.policy}
            after={next}
            decimals={decimals}
            symbol={token.data?.symbol ?? ""}
          />
        </div>
      ) : null}
      <div className="mt-5">
        {state.status === "confirmed" ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <Button onClick={() => void submit()} disabled={state.status === "signing"}>
            {state.status === "signing" ? "Confirm in your wallet…" : "Save limits"}
          </Button>
        )}
      </div>
      <ActionStatus state={state} onDirect={() => void runDirect()} />
    </BottomSheet>
  );
}
