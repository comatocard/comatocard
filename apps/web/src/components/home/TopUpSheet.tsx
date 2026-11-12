"use client";
import { useState } from "react";
import { useToken } from "../../hooks/data";
import { useOwnerAction } from "../../hooks/useOwnerAction";
import { isRegistered } from "../../lib/chain";
import { TOKEN_ID } from "../../lib/config";
import { parseUnits } from "../../lib/units";
import { topUpCalls } from "../../lib/vault-setup";
import { ActionStatus } from "../form/ActionStatus";
import { Field } from "../form/Field";
import { BottomSheet, Button } from "../ui";

/** Funds the vault from the test token's public faucet: mint to you, then deposit to the vault. */
export function TopUpSheet({
  open,
  onClose,
  owner,
  vault,
}: {
  open: boolean;
  onClose: () => void;
  owner: string;
  vault: string;
}) {
  const token = useToken();
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const { state, runDirect, reset } = useOwnerAction(vault);
  const symbol = token.data?.symbol ?? "";

  const submit = async () => {
    setError(null);
    const decimals = token.data?.decimals;
    if (decimals === undefined) return;
    const raw = parseUnits(amount, decimals);
    if (!raw || raw === "0" || BigInt(raw) > 10_000n * 10n ** BigInt(decimals)) {
      setError("Enter an amount up to 10,000.");
      return;
    }
    const [ownerRegistered, vaultRegistered] = await Promise.all([
      isRegistered(TOKEN_ID, owner),
      isRegistered(TOKEN_ID, vault),
    ]);
    await runDirect(
      topUpCalls({ token: TOKEN_ID, owner, vault, amount: raw, ownerRegistered, vaultRegistered }),
    );
  };

  const close = () => {
    reset();
    setError(null);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} label="Top up">
      <h2 className="mb-1 text-xl font-semibold">Top up with test {symbol}</h2>
      <p className="mb-5 text-sm text-muted">
        {symbol} is the testnet stablecoin. Its faucet mints to your account, then one deposit moves
        it into your card account. Cards spend from it only.
      </p>
      <Field
        label="Amount"
        inputMode="decimal"
        suffix={symbol}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={error}
      />
      <div className="mt-5">
        {state.status === "confirmed" ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <Button
            onClick={() => void submit()}
            disabled={!token.data || state.status === "signing"}
          >
            {state.status === "signing" ? "Confirm in your wallet…" : "Mint and deposit"}
          </Button>
        )}
      </div>
      <ActionStatus state={state} />
    </BottomSheet>
  );
}
