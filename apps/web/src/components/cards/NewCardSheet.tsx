"use client";
import { type CardKind, vaultCalls } from "@comatocard/sdk";
import { KeyPair } from "near-api-js";
import { useState } from "react";
import { useToken } from "../../hooks/data";
import { useOwnerAction } from "../../hooks/useOwnerAction";
import { TOKEN_ID } from "../../lib/config";
import { DEFAULT_FORM, type PolicyForm, toPolicy } from "../../lib/policy-form";
import { ActionStatus } from "../form/ActionStatus";
import { Choice, Field } from "../form/Field";
import { PolicyFields } from "../form/PolicyFields";
import { BottomSheet, Button, CopyButton } from "../ui";

const KINDS = [
  { value: "agent", label: "Agent" },
  { value: "human", label: "Person" },
  { value: "treasury", label: "Treasury" },
] as const;

/**
 * Issues a card. The key pair is made here, in the browser; only the public key goes on chain.
 * The secret is shown once, after the card exists, for the agent or person who will hold it.
 */
export function NewCardSheet({
  open,
  onClose,
  vault,
}: {
  open: boolean;
  onClose: () => void;
  vault: string;
}) {
  const token = useToken();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<CardKind>("agent");
  const [form, setForm] = useState<PolicyForm>(DEFAULT_FORM);
  const [error, setError] = useState<{ field: keyof PolicyForm; message: string } | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const { state, run, runDirect, reset } = useOwnerAction(vault);
  const symbol = token.data?.symbol ?? "";

  const submit = async () => {
    setError(null);
    setLabelError(null);
    const decimals = token.data?.decimals;
    if (decimals === undefined) return;
    const trimmed = label.trim();
    if (!trimmed || new TextEncoder().encode(trimmed).length > 64) {
      setLabelError("Name the card, up to 64 characters.");
      return;
    }
    const result = toPolicy(form, { token: TOKEN_ID, decimals });
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    const key = KeyPair.fromRandom("ed25519");
    const call = vaultCalls(vault).createCard({
      publicKey: key.getPublicKey().toString(),
      label: trimmed,
      kind,
      policy: result.policy,
    });
    // Kept in memory only until the sheet closes; the vault stores the public key alone.
    setSecret(key.toString());
    if (!(await run(call))) return;
  };

  const close = () => {
    reset();
    setSecret(null);
    setLabel("");
    setForm(DEFAULT_FORM);
    setError(null);
    onClose();
  };

  const envSnippet = secret ? `VAULT_ID=${vault}\nCARD_PRIVATE_KEY=${secret}\n` : "";

  return (
    <BottomSheet open={open} onClose={close} label="New card">
      {state.status === "confirmed" && secret ? (
        <div>
          <h2 className="mb-1 text-xl font-semibold">Card issued</h2>
          <p className="mb-4 text-sm text-muted">
            This is the card&apos;s secret key. It is shown once and never stored here. Give it to
            the agent or person who will pay with the card; the card can only call <code>pay</code>,
            inside the limits you set.
          </p>
          <div className="rounded-2xl border border-line bg-white p-4 font-mono text-[12px] leading-relaxed break-all">
            {envSnippet}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[13px] text-muted">For the agent&apos;s .env</span>
            <CopyButton value={envSnippet} label="Copy" />
          </div>
          <ActionStatus state={state} />
          <div className="mt-5">
            <Button onClick={close}>I saved it</Button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-1 text-xl font-semibold">New card</h2>
          <p className="mb-5 text-sm text-muted">
            A card is a key that can only pay from this vault, inside these limits. The holder
            can&apos;t change them.
          </p>
          <div className="space-y-4">
            <Field
              label="Name"
              placeholder="Research agent"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              error={labelError}
            />
            <Choice label="Who holds it" options={KINDS} value={kind} onChange={setKind} />
            <PolicyFields form={form} onChange={setForm} symbol={symbol} error={error} />
          </div>
          <div className="mt-6">
            <Button
              onClick={() => void submit()}
              disabled={!token.data || state.status === "signing"}
            >
              {state.status === "signing" ? "Confirm in your wallet…" : "Issue card"}
            </Button>
          </div>
          <ActionStatus state={state} onDirect={() => void runDirect()} />
        </div>
      )}
    </BottomSheet>
  );
}
