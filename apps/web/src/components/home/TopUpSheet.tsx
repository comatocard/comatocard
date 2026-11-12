"use client";
import { useState } from "react";
import { useTopUp } from "../../hooks/setup";
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
  const [amount, setAmount] = useState("100");
  const { topUp, error, symbol, ready, state, reset } = useTopUp(owner, vault);

  const close = () => {
    reset();
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
            onClick={() => void topUp(amount)}
            disabled={!ready || state.status === "signing"}
          >
            {state.status === "signing" ? "Confirm in your wallet…" : "Mint and deposit"}
          </Button>
        )}
      </div>
      <ActionStatus state={state} />
    </BottomSheet>
  );
}
