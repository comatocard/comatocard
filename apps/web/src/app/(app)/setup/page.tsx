"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { NewCardSheet } from "../../../components/cards/NewCardSheet";
import { CreateVaultSheet } from "../../../components/home/CreateVaultSheet";
import { TopUpSheet } from "../../../components/home/TopUpSheet";
import { VaultPicker } from "../../../components/home/VaultPicker";
import { Button, Card, PageHeader } from "../../../components/ui";
import { tokenBalance, useBalances, useCards } from "../../../hooks/data";
import { useOwnership } from "../../../hooks/useOwnership";
import { useVault } from "../../../hooks/useVault";

type Sheet = "vault" | "funds" | "card" | null;

function Step({
  index,
  title,
  body,
  done,
  enabled,
  action,
  onAction,
}: {
  index: number;
  title: string;
  body: string;
  done: boolean;
  enabled: boolean;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-start gap-4 py-4">
      <span
        aria-hidden="true"
        className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${
          done ? "bg-ink text-white" : "border border-line bg-white text-muted"
        }`}
      >
        {done ? "✓" : index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">
          {title}
          <span className="sr-only">{done ? ", done" : ""}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{body}</p>
        {done ? null : (
          <div className="mt-3">
            <Button size="md" block={false} onClick={onAction} disabled={!enabled}>
              {action}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Wrap({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[560px]">{children}</div>;
}

/**
 * First run for a connected wallet: create a vault, fund it from the test faucet, issue the first
 * card. Each step reads its state from the chain, so a reload resumes where it stopped.
 */
export default function SetupPage() {
  const router = useRouter();
  const { vaultId } = useVault();
  const { isOwner, accountId } = useOwnership(vaultId);
  const vault = isOwner ? vaultId : null;
  const balances = useBalances(vault);
  const cards = useCards(vault);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);

  const hasVault = vault !== null;
  const funded = BigInt(tokenBalance(balances.data)?.available ?? "0") > 0n;
  const hasCard = (cards.data?.length ?? 0) > 0;

  return (
    <Wrap>
      <PageHeader
        className="mb-5"
        title="Set up your cards"
        description="Three steps, all on NEAR testnet. You can stop and come back."
      />
      <Card className="divide-y divide-line px-5">
        <Step
          index={1}
          title="Create your card account"
          body="Holds the money your cards spend, as its own NEAR account that only you control. 0.5 NEAR from your wallet pays its storage and card gas."
          done={hasVault}
          enabled
          action="Create a card account"
          onAction={() => setSheet("vault")}
        />
        <Step
          index={2}
          title="Add test funds"
          body="Mint tUSD, the testnet stablecoin, and deposit it. Cards spend from it only."
          done={funded}
          enabled={hasVault}
          action="Top up"
          onAction={() => setSheet("funds")}
        />
        <Step
          index={3}
          title="Issue your first card"
          body="A key that can only pay, inside limits you set. Give it to an agent or a person."
          done={hasCard}
          enabled={hasVault}
          action="New card"
          onAction={() => setSheet("card")}
        />
      </Card>

      <div className="mt-6">
        <Button onClick={() => router.replace("/home")} disabled={!hasVault}>
          {hasCard ? "Go to my cards" : "Skip to my cards"}
        </Button>
      </div>
      <div className="mt-5 flex justify-center">
        <VaultPicker
          owner={accountId}
          onCreate={() => setSheet("vault")}
          label="Already have a card account?"
        />
      </div>

      {accountId ? (
        <CreateVaultSheet open={sheet === "vault"} onClose={close} owner={accountId} />
      ) : null}
      {vault && accountId ? (
        <>
          <TopUpSheet open={sheet === "funds"} onClose={close} owner={accountId} vault={vault} />
          <NewCardSheet open={sheet === "card"} onClose={close} vault={vault} />
        </>
      ) : null}
    </Wrap>
  );
}
