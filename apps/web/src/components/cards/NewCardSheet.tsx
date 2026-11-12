"use client";
import type { CardKind } from "@comatocard/sdk";
import { useState } from "react";
import { useIssueCard } from "../../hooks/setup";
import { DEFAULT_FORM, type PolicyForm } from "../../lib/policy-form";
import { cardEnv } from "../../lib/setup-flow";
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
 * Issues a card with every policy field. The secret is shown once, after the card exists, for the
 * agent or person who will hold it.
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
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<CardKind>("agent");
  const [form, setForm] = useState<PolicyForm>(DEFAULT_FORM);
  const { issue, error, secret, symbol, ready, state, retryDirect, reset } = useIssueCard(vault);
  const policyError =
    error && error.field !== "label" ? { field: error.field, message: error.message } : null;

  const close = () => {
    reset();
    setLabel("");
    setForm(DEFAULT_FORM);
    onClose();
  };

  const envSnippet = secret ? cardEnv(vault, secret) : "";

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
            A card is a key that can only pay from your card account, inside these limits. The
            holder can&apos;t change them.
          </p>
          <div className="space-y-4">
            <Field
              label="Name"
              placeholder="Research agent"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              error={error?.field === "label" ? error.message : null}
            />
            <Choice label="Who holds it" options={KINDS} value={kind} onChange={setKind} />
            <PolicyFields form={form} onChange={setForm} symbol={symbol} error={policyError} />
          </div>
          <div className="mt-6">
            <Button
              onClick={() => void issue({ label, kind, form })}
              disabled={!ready || state.status === "signing"}
            >
              {state.status === "signing" ? "Confirm in your wallet…" : "Issue card"}
            </Button>
          </div>
          <ActionStatus state={state} onDirect={retryDirect} />
        </div>
      )}
    </BottomSheet>
  );
}
