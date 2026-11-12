"use client";
import { type CardKind, vaultCalls } from "@comatocard/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { KeyPair } from "near-api-js";
import { useState } from "react";
import { accountExists, isRegistered } from "../lib/chain";
import { FACTORY_ID, TOKEN_ID } from "../lib/config";
import { type PolicyForm, toPolicy } from "../lib/policy-form";
import { parseUnits } from "../lib/units";
import { createVaultCall, topUpCalls, VAULT_NAME } from "../lib/vault-setup";
import { useToken } from "./data";
import { useOwnerAction } from "./useOwnerAction";
import { useVault } from "./useVault";

/** The highest amount the faucet top-up accepts, in token units. */
const TOP_UP_MAX = 10_000n;

/**
 * Creates `<name>.<factory>` owned by the connected wallet. A deposit is attached, so the owner
 * signs and pays; it is never relayed. On success the new vault becomes the open one.
 */
export function useCreateVault(owner: string) {
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const action = useOwnerAction(null);
  const { setVaultId } = useVault();
  const queryClient = useQueryClient();

  const create = async (name: string) => {
    setError(null);
    if (!VAULT_NAME.test(name)) {
      setError("Use lowercase letters, digits, - or _.");
      return false;
    }
    const vaultId = `${name}.${FACTORY_ID}`;
    setChecking(true);
    const taken = await accountExists(vaultId).catch(() => false);
    setChecking(false);
    if (taken) {
      setError(`${vaultId} already exists.`);
      return false;
    }
    if (!(await action.runDirect([createVaultCall(FACTORY_ID, name)]))) return false;
    setVaultId(vaultId);
    void queryClient.invalidateQueries({ queryKey: ["vaults", owner] });
    return true;
  };

  const reset = () => {
    action.reset();
    setError(null);
  };

  return { create, error, checking, state: action.state, reset };
}

/** Funds a vault from the test token's faucet: mint to the owner, then deposit to the vault. */
export function useTopUp(owner: string, vault: string | null) {
  const token = useToken();
  const [error, setError] = useState<string | null>(null);
  const action = useOwnerAction(vault);

  const topUp = async (amount: string) => {
    setError(null);
    const decimals = token.data?.decimals;
    if (decimals === undefined || !vault) return false;
    const raw = parseUnits(amount, decimals);
    if (!raw || raw === "0" || BigInt(raw) > TOP_UP_MAX * 10n ** BigInt(decimals)) {
      setError("Enter an amount up to 10,000.");
      return false;
    }
    const [ownerRegistered, vaultRegistered] = await Promise.all([
      isRegistered(TOKEN_ID, owner),
      isRegistered(TOKEN_ID, vault),
    ]);
    return action.runDirect(
      topUpCalls({ token: TOKEN_ID, owner, vault, amount: raw, ownerRegistered, vaultRegistered }),
    );
  };

  const reset = () => {
    action.reset();
    setError(null);
  };

  return {
    topUp,
    error,
    symbol: token.data?.symbol ?? "",
    ready: !!token.data,
    state: action.state,
    reset,
  };
}

export type CardFieldError = { field: keyof PolicyForm | "label"; message: string };

/**
 * Issues a card. The key pair is made here, in the browser; only the public key goes on chain.
 * The secret stays in memory for the caller to show once.
 */
export function useIssueCard(vault: string | null) {
  const token = useToken();
  const [error, setError] = useState<CardFieldError | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const action = useOwnerAction(vault);

  const issue = async (input: { label: string; kind: CardKind; form: PolicyForm }) => {
    setError(null);
    const decimals = token.data?.decimals;
    if (decimals === undefined || !vault) return false;
    const label = input.label.trim();
    if (!label || new TextEncoder().encode(label).length > 64) {
      setError({ field: "label", message: "Name the card, up to 64 characters." });
      return false;
    }
    const result = toPolicy(input.form, { token: TOKEN_ID, decimals });
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return false;
    }
    const key = KeyPair.fromRandom("ed25519");
    setSecret(key.toString());
    return action.run(
      vaultCalls(vault).createCard({
        publicKey: key.getPublicKey().toString(),
        label,
        kind: input.kind,
        policy: result.policy,
      }),
    );
  };

  const reset = () => {
    action.reset();
    setSecret(null);
    setError(null);
  };

  return {
    issue,
    error,
    secret,
    symbol: token.data?.symbol ?? "",
    ready: !!token.data,
    state: action.state,
    retryDirect: () => void action.runDirect(),
    reset,
  };
}
