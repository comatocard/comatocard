"use client";
import type { VaultRow } from "@comatocard/sdk";
import { useState } from "react";
import { useOwnerVaults } from "../../hooks/data";
import { useVault } from "../../hooks/useVault";
import { FACTORY_ID } from "../../lib/config";
import { Field } from "../form/Field";
import { BottomSheet, Button } from "../ui";

const shortVault = (vault: string) => vault.replace(`.${FACTORY_ID}`, "");

/** The vault pill at the top of Home, and the sheet to switch, open by name, or create one. */
export function VaultPicker({
  owner,
  onCreate,
  label,
}: {
  owner: string | null;
  onCreate: () => void;
  /** Text of the trigger when no vault is open. */
  label?: string;
}) {
  const { vaultId, setVaultId } = useVault();
  const vaults = useOwnerVaults(owner);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const choose = (vault: string) => {
    setVaultId(vault);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto flex h-10 items-center gap-2 rounded-full border border-line bg-white pl-4 pr-3 text-[14px] font-semibold [box-shadow:0_8px_18px_-12px_rgba(0,0,0,.2)]"
      >
        <span className="max-w-[220px] truncate">
          {vaultId ? shortVault(vaultId) : (label ?? "Choose a vault")}
        </span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} label="Vaults">
        <h2 className="mb-4 text-xl font-semibold">Vaults</h2>
        {owner ? (
          <div className="mb-5 divide-y divide-line rounded-[16px] border border-line bg-white px-4">
            <VaultList
              owner={owner}
              current={vaultId}
              vaults={vaults.data}
              loading={vaults.isLoading}
              failed={vaults.error !== null}
              onChoose={choose}
            />
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = name.trim().toLowerCase();
            if (v) choose(v.includes(".") ? v : `${v}.${FACTORY_ID}`);
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field
              label="Open a vault by name"
              placeholder={`name or name.${FACTORY_ID}`}
              autoCapitalize="none"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" size="md" block={false} variant="glass" className="h-12">
            Open
          </Button>
        </form>
        {owner ? (
          <div className="mt-5">
            <Button
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              Create a vault
            </Button>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}

function VaultList({
  owner,
  current,
  vaults,
  loading,
  failed,
  onChoose,
}: {
  owner: string;
  current: string | null;
  vaults: VaultRow[] | undefined;
  loading: boolean;
  failed: boolean;
  onChoose: (vault: string) => void;
}) {
  const note = (text: string) => <div className="py-3.5 text-sm text-muted">{text}</div>;
  if (loading) return note("Loading your vaults…");
  if (failed)
    return note(
      "Your vaults could not be listed: the indexer is not reachable. Open one by name below.",
    );
  if (!vaults?.length) return note(`No vault yet for ${owner}.`);
  return (
    <>
      {vaults.map((v) => (
        <button
          key={v.vault_id}
          type="button"
          onClick={() => onChoose(v.vault_id)}
          className="flex w-full items-center justify-between py-3.5 text-left"
        >
          <span>
            <span className="block text-[14px] font-semibold">{shortVault(v.vault_id)}</span>
            <span className="block text-[12px] text-muted">{v.vault_id}</span>
          </span>
          {v.vault_id === current ? <span className="text-[12px] font-semibold">Open</span> : null}
        </button>
      ))}
    </>
  );
}
