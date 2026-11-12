"use client";
import type { Proposal } from "@comatocard/agents/policy-assistant";
import { type Card, vaultCalls } from "@comatocard/sdk";
import { useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useToken } from "../../hooks/data";
import { type ActionState, useOwnerAction } from "../../hooks/useOwnerAction";
import { ActionStatus } from "../form/ActionStatus";
import { TextArea } from "../form/Field";
import { BottomSheet, Button } from "../ui";
import { PolicyDiff } from "./PolicyDiff";
import { TeePanel } from "./TeePanel";

const EXAMPLES = [
  "Lower the daily limit to 40 and only allow comatocard-shop.testnet",
  "Ask me before any payment above 5",
  "Refuse blocked accounts and hold flagged ones for me",
];

/** What the assistant is doing while it waits, in the order the server does it. */
const STEPS = [
  "Asking a model inside a TEE",
  "Checking the answer's signature",
  "Checking the TEE's attestation",
];

type Result = Proposal | { kind: "error"; message: string };

function askLabel(busy: boolean, asked: boolean): string {
  if (busy) return "Thinking…";
  return asked ? "Ask again" : "Propose limits";
}

function signLabel(signing: boolean, verified: boolean): string {
  if (signing) return "Confirm in your wallet…";
  return verified ? "Sign the new limits" : "Not verified, not offered";
}

/**
 * Plain language in, a full policy out. The model runs in a TEE on NEAR AI Cloud; the server checks
 * the answer's signature and the TEE's Intel TDX attestation before showing it. A proposal is
 * offered for signing only when every check passed, and the owner still signs it.
 */
export function AssistantSheet({
  open,
  onClose,
  vault,
  card,
  canSign,
}: {
  open: boolean;
  onClose: () => void;
  vault: string;
  card: Card;
  /** Only the owner signs; anyone can see a proposal and its TEE checks. */
  canSign: boolean;
}) {
  const token = useToken();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const { state, run, runDirect, reset } = useOwnerAction(vault);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6_000);
    return () => window.clearInterval(id);
  }, [busy]);

  const ask = async () => {
    setBusy(true);
    setResult(null);
    reset();
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vault, cardId: card.id, request }),
      });
      const body = (await response.json()) as Proposal | { error: string };
      setResult("error" in body ? { kind: "error", message: body.error } : body);
    } catch {
      setResult({ kind: "error", message: "The assistant could not be reached." });
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    reset();
    setResult(null);
    setRequest("");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} label="Policy assistant">
      <h2 className="mb-1 text-xl font-semibold">Ask the assistant</h2>
      <p className="mb-5 text-sm text-muted">
        Say how {card.label} should spend. A private model proposes the new limits; you check them
        and sign.
      </p>

      <TextArea
        label="What should change?"
        placeholder={EXAMPLES[0]}
        value={request}
        maxLength={500}
        onChange={(e) => setRequest(e.target.value)}
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setRequest(example)}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-[12px] font-medium text-ink-2 hover:border-line-2"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <Button onClick={() => void ask()} disabled={busy || request.trim().length < 3}>
          {askLabel(busy, result !== null)}
        </Button>
      </div>

      {busy ? (
        <div role="status" className="mt-5 flex items-center gap-2.5">
          <ThinkingOrb state="solving" size={20} aria-hidden className="shrink-0" />
          <span className="text-shimmer text-[13.5px] font-medium">{STEPS[step]}…</span>
          <span className="ml-auto text-[12px] text-muted">up to a minute</span>
        </div>
      ) : null}

      {result ? (
        <ProposalResult
          result={result}
          decimals={token.data?.decimals ?? 0}
          symbol={token.data?.symbol ?? ""}
          state={state}
          canSign={canSign}
          onSign={(p) => void run(vaultCalls(vault).updatePolicy(card.id, p.proposed))}
          onDirect={() => void runDirect()}
          onDone={close}
        />
      ) : null}
    </BottomSheet>
  );
}

/** The assistant's answer: an error, a refused answer, or a proposal with its TEE checks. */
function ProposalResult({
  result,
  decimals,
  symbol,
  state,
  canSign,
  onSign,
  onDirect,
  onDone,
}: {
  canSign: boolean;
  result: Result;
  decimals: number;
  symbol: string;
  state: ActionState;
  onSign: (proposal: Extract<Proposal, { kind: "proposal" }>) => void;
  onDirect: () => void;
  onDone: () => void;
}) {
  if (result.kind === "error") {
    return <p className="mt-4 text-center text-[13px] text-neg">{result.message}</p>;
  }
  if (result.kind === "invalid") {
    return (
      <div className="mt-5 rounded-[16px] border border-line bg-white p-4 text-[13px]">
        <div className="font-semibold">No usable proposal</div>
        <p className="mt-1 text-muted">
          The answer was refused: {result.reason}. Try saying it differently.
        </p>
      </div>
    );
  }
  const verified = result.verification.verified;
  const signing = state.status === "signing";
  return (
    <div className="mt-5 space-y-4">
      <PolicyDiff
        before={result.current}
        after={result.proposed}
        decimals={decimals}
        symbol={symbol}
      />
      <TeePanel verification={result.verification} />
      <SignStep
        canSign={canSign}
        confirmed={state.status === "confirmed"}
        disabled={!verified || result.changed.length === 0 || signing}
        label={signLabel(signing, verified)}
        onSign={() => onSign(result)}
        onDone={onDone}
      />
      <ActionStatus state={state} onDirect={onDirect} />
    </div>
  );
}

function SignStep({
  canSign,
  confirmed,
  disabled,
  label,
  onSign,
  onDone,
}: {
  canSign: boolean;
  confirmed: boolean;
  disabled: boolean;
  label: string;
  onSign: () => void;
  onDone: () => void;
}) {
  if (!canSign) {
    return (
      <p className="text-center text-[13px] text-muted">
        Only the vault owner can sign these limits.
      </p>
    );
  }
  if (confirmed) return <Button onClick={onDone}>Done</Button>;
  return (
    <Button onClick={onSign} disabled={disabled}>
      {label}
    </Button>
  );
}
