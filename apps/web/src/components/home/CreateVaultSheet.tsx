"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOwnerAction } from "../../hooks/useOwnerAction";
import { useVault } from "../../hooks/useVault";
import { accountExists } from "../../lib/chain";
import { FACTORY_ID } from "../../lib/config";
import { createVaultCall, VAULT_NAME } from "../../lib/vault-setup";
import { ActionStatus } from "../form/ActionStatus";
import { Field } from "../form/Field";
import { BottomSheet, Button } from "../ui";

/** Creates `<name>.<factory>` owned by the connected wallet, with 0.5 NEAR for storage and gas. */
export function CreateVaultSheet({
  open,
  onClose,
  owner,
}: {
  open: boolean;
  onClose: () => void;
  owner: string;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { state, runDirect, reset } = useOwnerAction(null);
  const { setVaultId } = useVault();
  const queryClient = useQueryClient();
  const vaultId = `${name}.${FACTORY_ID}`;

  const submit = async () => {
    setError(null);
    if (!VAULT_NAME.test(name)) {
      setError("Use lowercase letters, digits, - or _.");
      return;
    }
    setChecking(true);
    const taken = await accountExists(vaultId).catch(() => false);
    setChecking(false);
    if (taken) {
      setError(`${vaultId} already exists.`);
      return;
    }
    // A deposit is attached, so this one is signed and paid by the owner, never relayed.
    if (await runDirect([createVaultCall(FACTORY_ID, name)])) {
      setVaultId(vaultId);
      void queryClient.invalidateQueries({ queryKey: ["vaults", owner] });
    }
  };

  const close = () => {
    reset();
    setName("");
    setError(null);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} label="Create a card account">
      <h2 className="mb-1 text-xl font-semibold">Create a card account</h2>
      <p className="mb-5 text-sm text-muted">
        Your card account holds the money your cards spend. It is its own NEAR account and only you
        control it. 0.5 NEAR from your wallet pays its storage and the gas of every card payment.
      </p>
      <Field
        label="Name"
        value={name}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="acme"
        onChange={(e) => setName(e.target.value.toLowerCase().trim())}
        error={error}
        hint={name ? vaultId : `Its NEAR account will be <name>.${FACTORY_ID}`}
      />
      <div className="mt-5">
        {state.status === "confirmed" ? (
          <Button onClick={close}>Continue</Button>
        ) : (
          <Button
            onClick={() => void submit()}
            disabled={!name || checking || state.status === "signing"}
          >
            {state.status === "signing" ? "Confirm in your wallet…" : "Create with 0.5 NEAR"}
          </Button>
        )}
      </div>
      <ActionStatus state={state} />
    </BottomSheet>
  );
}
