"use client";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  LogOut,
  ReceiptText,
} from "lucide-react";
import { useNearWallet } from "near-connect-hooks";
import { useRef, useState } from "react";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { TreasuryPanel } from "../../../components/account/TreasuryPanel";
import { Card, PageHeader, Section } from "../../../components/ui";
import { useToken } from "../../../hooks/data";
import { useNav } from "../../../hooks/useNav";
import { useOwnership } from "../../../hooks/useOwnership";
import { shortAccount, useSignOut } from "../../../hooks/useSession";
import { useVault } from "../../../hooks/useVault";
import { vaultLabel } from "../../../lib/cards";
import { accountUrl, NETWORK } from "../../../lib/config";
import { exportCsvUrl } from "../../../lib/indexer";
import { SmoothHeight } from "../../../lib/motion/SmoothHeight";
import { useTweenTo } from "../../../lib/motion/useShowHide";

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

/**
 * The contract's own details, folded away: most owners never need them. The height and the
 * chevron move with GSAP.
 */
function TechnicalDetails({ rows }: { rows: { label: string; value: string; href?: string }[] }) {
  const [open, setOpen] = useState(false);
  const chevron = useRef<HTMLSpanElement>(null);
  useTweenTo(chevron, { rotation: open ? 180 : 0 }, { duration: 0.2 });
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 py-3.5 text-left text-[13.5px]"
      >
        <span className="text-muted">Technical details</span>
        <span className="flex items-center gap-1.5 font-semibold">
          {open ? "Hide" : "Contract, registry"}
          <span ref={chevron} className="grid">
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="text-faint" />
          </span>
        </span>
      </button>
      <SmoothHeight>
        {open ? (
          <div className="divide-y divide-line border-t border-line">
            {rows.map((row) => (
              <Row key={row.label} {...row} />
            ))}
          </div>
        ) : null}
      </SmoothHeight>
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
    <div className="mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-[960px]">
      <PageHeader className="mb-5" title="Account" />

      {/* Two equal columns on a desktop: who you are and the card account, then money and records. */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div>
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
                  <Row label="Name" value={vaultLabel(vaultId)} href={accountUrl(vaultId)} />
                  <Row
                    label="Owner"
                    value={owner && owner === accountId ? "You" : (owner ?? "…")}
                    {...ownerLink}
                  />
                  <Row
                    label="Approvals expire after"
                    value={config.data ? hours(config.data.approval_ttl) : "…"}
                  />
                  <TechnicalDetails
                    rows={[
                      { label: "Account", value: vaultId, href: accountUrl(vaultId) },
                      {
                        label: "Contract",
                        value: config.data ? `v${config.data.contract_version}` : "…",
                      },
                      { label: "Registry", value: config.data?.registry ?? "None" },
                    ]}
                  />
                </Card>
              </Section>
            </>
          ) : null}
        </div>

        <div>
          {vaultId ? (
            <>
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
                    className="flex items-center gap-3 py-3.5 text-[13.5px] font-semibold"
                  >
                    <FileSpreadsheet
                      size={17}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="shrink-0 text-muted"
                    />
                    <span className="flex-1">Download CSV for your accountant</span>
                    <Download size={15} strokeWidth={2} aria-hidden="true" className="text-faint" />
                  </a>
                  <button
                    type="button"
                    onClick={() => nav.forward("/activity")}
                    className="flex w-full items-center gap-3 py-3.5 text-left text-[13.5px] font-semibold"
                  >
                    <ReceiptText
                      size={17}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="shrink-0 text-muted"
                    />
                    <span className="flex-1">Full history</span>
                    <ChevronRight
                      size={15}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="text-faint"
                    />
                  </button>
                </Card>
              </Section>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-full items-center gap-2.5 rounded-card border border-white bg-card px-5 py-4 text-left text-[14.5px] font-semibold transition-colors hover:bg-white"
          >
            <LogOut size={17} strokeWidth={2} aria-hidden="true" className="text-muted" />
            {accountId ? "Log out" : "Leave"}
          </button>
        </div>
      </div>
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
