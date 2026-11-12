"use client";
import { useNearWallet } from "near-connect-hooks";
import { useState } from "react";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { TreasuryPanel } from "../../../components/account/TreasuryPanel";
import { Card, PageHeader, Section } from "../../../components/ui";
import { useToken } from "../../../hooks/data";
import { useNav } from "../../../hooks/useNav";
import { useOwnership } from "../../../hooks/useOwnership";
import { shortAccount, useSignOut } from "../../../hooks/useSession";
import { useVault } from "../../../hooks/useVault";
import { accountUrl, NETWORK } from "../../../lib/config";
import { exportCsvUrl } from "../../../lib/indexer";

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-[13.5px]">
      <span className="text-muted">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="min-w-0 truncate font-semibold">
          {value}
        </a>
      ) : (
        <span className="min-w-0 truncate font-semibold">{value}</span>
      )}
    </div>
  );
}

const hours = (ns: string) => `${Number(BigInt(ns) / 3_600_000_000_000n)} hours`;

export default function AccountPage() {
  const { vaultId } = useVault();
  const { accountId, owner, config } = useOwnership(vaultId);
  const { connector } = useNearWallet();
  const token = useToken();
  const signOut = useSignOut();
  const nav = useNav();
  const [confirming, setConfirming] = useState(false);
  const ownerLink = owner ? { href: accountUrl(owner) } : {};

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageHeader className="mb-5" title="Account" />

      <Card className="mb-[22px] flex items-center gap-4 p-5">
        <Identicon address={accountId ?? vaultId ?? ""} size={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold">
            {accountId ? shortAccount(accountId) : "No wallet connected"}
          </div>
          <div className="text-[13px] text-muted">NEAR {NETWORK}</div>
        </div>
        {accountId ? null : (
          <button
            type="button"
            onClick={() => void connector.connect().catch(() => undefined)}
            className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white"
          >
            Connect
          </button>
        )}
      </Card>

      {vaultId ? (
        <>
          <Section title="Card account" className="mb-[22px]">
            <Card className="divide-y divide-line px-5">
              <Row label="Account" value={vaultId} href={accountUrl(vaultId)} />
              <Row label="Owner" value={owner ?? "…"} {...ownerLink} />
              <Row
                label="Contract"
                value={config.data ? `v${config.data.contract_version}` : "…"}
              />
              <Row label="Registry" value={config.data?.registry ?? "None"} />
              <Row
                label="Approvals expire after"
                value={config.data ? hours(config.data.approval_ttl) : "…"}
              />
            </Card>
          </Section>

          <Section
            title="Treasury"
            info="The treasury agent keeps enough stablecoin for what the cards may still spend. On testnet it only plans; NEAR Intents has no testnet."
            className="mb-[22px]"
          >
            <TreasuryPanel
              vault={vaultId}
              decimals={token.data?.decimals ?? 0}
              symbol={token.data?.symbol ?? ""}
            />
          </Section>

          <Section title="Records" className="mb-[22px]">
            <Card className="divide-y divide-line px-5">
              <a
                href={exportCsvUrl(vaultId)}
                className="flex items-center justify-between py-3.5 text-[13.5px] font-semibold"
              >
                Download CSV for your accountant
                <span aria-hidden="true">↓</span>
              </a>
              <button
                type="button"
                onClick={() => nav.forward("/activity")}
                className="flex w-full items-center justify-between py-3.5 text-left text-[13.5px] font-semibold"
              >
                Full history
                <span aria-hidden="true">→</span>
              </button>
            </Card>
          </Section>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 h-12 w-full rounded-full border border-line bg-white text-[15px] font-semibold text-neg"
      >
        {accountId ? "Log out" : "Leave"}
      </button>
      <LogoutSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void signOut().then(() => nav.forward("/"));
        }}
      />
    </div>
  );
}
