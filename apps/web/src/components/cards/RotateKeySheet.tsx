"use client";
import { type Card, vaultCalls } from "@comatocard/sdk";
import { KeyPair } from "near-api-js";
import { useState } from "react";
import { useOwnerAction } from "../../hooks/useOwnerAction";
import { ActionStatus } from "../form/ActionStatus";
import { BottomSheet, Button, CopyButton } from "../ui";

/** Replaces the card key and refills its gas allowance. The old key stops working at once. */
export function RotateKeySheet({
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
  const [secret, setSecret] = useState<string | null>(null);
  const { state, run, runDirect, reset } = useOwnerAction(vault);

  const submit = async () => {
    const key = KeyPair.fromRandom("ed25519");
    setSecret(key.toString());
    await run(vaultCalls(vault).rotateCardKey(card.id, key.getPublicKey().toString()));
  };

  const close = () => {
    reset();
    setSecret(null);
    onClose();
  };

  const snippet = secret ? `VAULT_ID=${vault}\nCARD_PRIVATE_KEY=${secret}\n` : "";

  return (
    <BottomSheet open={open} onClose={close} label="New key">
      {state.status === "confirmed" && secret ? (
        <div>
          <h2 className="mb-1 text-xl font-semibold">New key is live</h2>
          <p className="mb-4 text-sm text-muted">
            The old key no longer works. Shown once, never stored here.
          </p>
          <div className="rounded-2xl border border-line bg-white p-4 font-mono text-[12px] leading-relaxed break-all">
            {snippet}
          </div>
          <div className="mt-3 flex justify-end">
            <CopyButton value={snippet} label="Copy" />
          </div>
          <div className="mt-5">
            <Button onClick={close}>I saved it</Button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-1 text-xl font-semibold">Give {card.label} a new key</h2>
          <p className="mb-5 text-sm text-muted">
            Use this when a key may have leaked, or when its gas allowance runs low. Limits and
            spend stay the same.
          </p>
          <Button onClick={() => void submit()} disabled={state.status === "signing"}>
            {state.status === "signing" ? "Confirm in your wallet…" : "Make a new key"}
          </Button>
          <ActionStatus state={state} onDirect={() => void runDirect()} />
        </div>
      )}
    </BottomSheet>
  );
}
