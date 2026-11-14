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
  const seed = fromPolicy(card.policy, token.data?.decimals);
  // The editor mounts only once the token is known, so its form never starts from raw units.
  if (!token.data || !seed) {
    return (
      <BottomSheet open={open} onClose={onClose} label="Edit limits">
        <h2 className="mb-1 text-xl font-semibold">Edit limits</h2>
        <p role="status" className="text-sm text-muted">
          Reading the card's limits…
        </p>
      </BottomSheet>
    );
  }
  return (
    <PolicyEditor
      open={open}
      onClose={onClose}
      vault={vault}
      card={card}
      seed={seed}
      decimals={token.data.decimals}
      symbol={token.data.symbol}
    />
  );
}

function PolicyEditor({
  open,
  onClose,
  vault,
  card,
  seed,
  decimals,
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  vault: string;
  card: Card;
  seed: PolicyForm;
  decimals: number;
  symbol: string;
}) {
  const [form, setForm] = useState<PolicyForm>(seed);
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
    setForm(seed);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} label="Edit limits">
      <h2 className="mb-1 text-xl font-semibold">Edit limits</h2>
      <p className="mb-5 text-sm text-muted">
        The new policy applies to the next payment. What {card.label} spent today still counts.
      </p>
      <PolicyFields form={form} onChange={setForm} symbol={symbol} error={error} />
      {next ? (
        <div className="mt-5">
          <PolicyDiff before={card.policy} after={next} decimals={decimals} symbol={symbol} />
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
