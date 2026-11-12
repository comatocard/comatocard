"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { Button, Card, CopyButton, SHELL } from "../../components/ui";
import { useToken } from "../../hooks/data";
import { txUrl } from "../../lib/config";
import type { Challenge } from "../../lib/merchant";
import { reasonText } from "../../lib/payments";
import { displayUnits } from "../../lib/units";

interface Report {
  resource: string;
  gas_price_yocto: string;
  block_height: number;
  receipt: { reference: string; payment_id: number | null; tx_hash: string | null; vault: string };
}

type Waiting = Challenge & { status?: string; reason?: string | null };

/** What the checkout says while it waits: nothing yet, or how far the payment got. */
function waitingText(challenge: Waiting): string {
  if (!challenge.status || challenge.status === "unpaid") return "Waiting for a card to pay";
  const why = challenge.reason ? `: ${reasonText(challenge.reason)}` : "";
  return `Payment ${challenge.status}${why}`;
}

/**
 * The demo merchant's checkout. The resource answers HTTP 402 with a challenge; an agent pays it
 * with its card and the reference; the page checks every few seconds and unlocks once the payment
 * settled on chain.
 */
export default function ShopPage() {
  const token = useToken();
  const [challenge, setChallenge] = useState<Waiting | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setReport(null);
    setError(null);
    const response = await fetch("/api/shop/report");
    if (response.status === 402) setChallenge((await response.json()) as Waiting);
    else setError("The shop did not answer with a challenge.");
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  // Poll the resource with the reference until it unlocks.
  useEffect(() => {
    if (!challenge || report) return;
    const id = window.setInterval(async () => {
      const response = await fetch(`/api/shop/report?reference=${challenge.reference}`);
      if (response.ok) setReport((await response.json()) as Report);
      else if (response.status === 402) setChallenge((await response.json()) as Waiting);
      else if (response.status === 409) setError("That reference was already used. Start again.");
    }, 3_000);
    return () => window.clearInterval(id);
  }, [challenge, report]);

  const symbol = token.data?.symbol ?? "";
  const decimals = token.data?.decimals ?? 0;

  return (
    <main className="min-h-dvh">
      <header className="border-b border-line bg-bg/80 [backdrop-filter:saturate(1.4)_blur(12px)]">
        <div className={`${SHELL} flex h-16 items-center gap-2.5`}>
          <Image
            src="/comatocard-icon.svg"
            alt=""
            width={512}
            height={512}
            className="size-6"
            priority
          />
          <span className="text-[17px] font-bold tracking-[-0.02em]">Comatocard Shop</span>
          <span className="ml-auto text-[13px] text-muted">Demo merchant, testnet</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] px-5 py-8">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-.02em]">
          NEAR gas report
        </h1>
        <p className="mt-1.5 text-[14px] text-muted">
          Live testnet gas price and block height. Sold to agents for{" "}
          {displayUnits("1000000", decimals)} {symbol} per request, over HTTP 402.
        </p>
        <Checkout
          report={report}
          challenge={challenge}
          error={error}
          decimals={decimals}
          symbol={symbol}
          onRestart={() => void start()}
        />
        {error && challenge ? (
          <p className="mt-4 text-center text-[13px] text-neg">{error}</p>
        ) : null}
      </div>
    </main>
  );
}

function Checkout({
  report,
  challenge,
  error,
  decimals,
  symbol,
  onRestart,
}: {
  report: Report | null;
  challenge: Waiting | null;
  error: string | null;
  decimals: number;
  symbol: string;
  onRestart: () => void;
}) {
  if (report) return <ReportCard report={report} onRestart={onRestart} />;
  if (!challenge) {
    return <p className="mt-6 text-center text-sm text-muted">{error ?? "Asking the shop…"}</p>;
  }
  return <ChallengeCard challenge={challenge} decimals={decimals} symbol={symbol} />;
}

function ReportCard({ report, onRestart }: { report: Report; onRestart: () => void }) {
  return (
    <Card className="mt-6 p-5">
      <div className="text-[13px] font-medium text-pos">Paid. Here is your report.</div>
      <dl className="mt-3 grid grid-cols-2 gap-y-2.5 text-[13.5px]">
        <dt className="text-muted">Gas price</dt>
        <dd className="text-right font-semibold tabular-nums">{report.gas_price_yocto} yocto</dd>
        <dt className="text-muted">Final block</dt>
        <dd className="text-right font-semibold tabular-nums">{report.block_height}</dd>
        <dt className="text-muted">Paid by</dt>
        <dd className="truncate text-right font-semibold">{report.receipt.vault}</dd>
      </dl>
      {report.receipt.tx_hash ? (
        <a
          href={txUrl(report.receipt.tx_hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block text-center text-[13px] font-semibold underline"
        >
          See the payment on chain
        </a>
      ) : null}
      <div className="mt-5">
        <Button onClick={onRestart}>Buy another</Button>
      </div>
    </Card>
  );
}

function ChallengeCard({
  challenge,
  decimals,
  symbol,
}: {
  challenge: Waiting;
  decimals: number;
  symbol: string;
}) {
  const command = `pnpm --filter @comatocard/agents pay ${challenge.merchant} ${challenge.amount} ${challenge.reference}`;
  return (
    <>
      <Card className="mt-6 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-muted">402 Payment required</span>
          <span className="text-[20px] font-semibold tabular-nums">
            {displayUnits(challenge.amount, decimals)}{" "}
            <span className="text-[13px] text-muted">{symbol}</span>
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">Pay to</dt>
          <dd className="truncate text-right font-semibold">{challenge.merchant}</dd>
          <dt className="text-muted">Reference</dt>
          <dd className="truncate text-right font-mono text-[12px]">{challenge.reference}</dd>
        </dl>
        <div role="status" className="mt-4 flex items-center gap-2.5 border-t border-line pt-4">
          <ThinkingOrb state="searching" size={20} aria-hidden className="shrink-0" />
          <span className="text-shimmer text-[13.5px] font-medium">{waitingText(challenge)}</span>
        </div>
      </Card>

      <h2 className="mx-1 mt-6 mb-2 text-sm font-medium text-muted">Pay from an agent</h2>
      <Card className="p-5">
        <p className="text-[13px] text-muted">
          An agent with a Comatocard card pays the challenge with the reference. Its guard checks
          the card policy and the merchant first.
        </p>
        <div className="mt-3 rounded-2xl border border-line bg-white p-3.5 font-mono text-[12px] leading-relaxed break-all">
          {command}
        </div>
        <div className="mt-2 flex justify-end">
          <CopyButton value={command} label="Copy command" />
        </div>
      </Card>
    </>
  );
}
