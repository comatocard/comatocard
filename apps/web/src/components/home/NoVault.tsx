"use client";
import { useState } from "react";
import { Button, Card } from "../ui";
import { CreateVaultSheet } from "./CreateVaultSheet";
import { VaultPicker } from "./VaultPicker";

/** Home before a vault is chosen: create one, or open one by name. */
export function NoVault({ accountId }: { accountId: string | null }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <VaultPicker owner={accountId} onCreate={() => setCreating(true)} />
      <div className="py-[26px]">
        <div className="text-[15px] font-medium text-muted">Your vault</div>
        <div className="mt-2 text-[clamp(26px,8vw,34px)] font-semibold leading-tight tracking-[-.02em]">
          Not created yet
        </div>
      </div>
      <Card className="p-5">
        <h2 className="text-[17px] font-semibold">Create your vault</h2>
        <p className="mt-1 mb-5 text-sm text-muted">
          A vault is a NEAR account that holds stablecoins and issues cards. You own it; nobody else
          can move its funds.
        </p>
        <Button onClick={() => setCreating(true)} disabled={!accountId}>
          {accountId ? "Create a vault" : "Connect a wallet first"}
        </Button>
      </Card>
      {accountId ? (
        <CreateVaultSheet open={creating} onClose={() => setCreating(false)} owner={accountId} />
      ) : null}
    </div>
  );
}
