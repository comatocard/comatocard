import type { Card as VaultCard } from "@comatocard/sdk";
import { currentSpend, merchantsText, remainingToday } from "../../lib/cards";
import { displayUnits } from "../../lib/units";
import { Card, InfoTip } from "../ui";
import { SpendBar } from "./SpendBar";

const RISK_TEXT = { off: "Off", block_only: "Refuse blocked", strict: "Strict" } as const;

/** The card's limits: what is left today, the two spend windows, and its rules. */
export function LimitsPanel({
  card,
  now,
  decimals,
  symbol,
}: {
  card: VaultCard;
  now: number | null;
  decimals: number;
  symbol: string;
}) {
  const spend = now ? currentSpend(card, now) : { today: "0", period: "0" };
  const p = card.policy;
  const left = remainingToday(p, spend);
  const rules: [string, string][] = [
    ["Per payment", `${displayUnits(p.per_tx_limit, decimals)} ${symbol}`],
    [
      "Ask me above",
      p.approval_threshold === null
        ? "Never"
        : `${displayUnits(p.approval_threshold, decimals)} ${symbol}`,
    ],
    ["Merchants", merchantsText(p.merchants)],
    ["Counterparty check", RISK_TEXT[p.risk_mode]],
    ["Held by", card.holder ?? "You"],
  ];
  return (
    <Card className="space-y-4 px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          Spending
          <InfoTip label="Spending">
            Checked by the contract on every payment. What is left today is the smaller of the day
            and the 30 day headroom.
          </InfoTip>
        </span>
        <span className="text-[13px] font-semibold text-pos tabular-nums">
          {displayUnits(left, decimals)} {symbol} left today
        </span>
      </div>
      <SpendBar
        label="Today"
        spent={spend.today}
        limit={p.daily_limit}
        decimals={decimals}
        symbol={symbol}
      />
      <SpendBar
        label="30 days"
        spent={spend.period}
        limit={p.monthly_limit}
        decimals={decimals}
        symbol={symbol}
      />
      <dl className="grid grid-cols-2 gap-y-3 border-t border-line pt-4 text-[13px]">
        {rules.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted">{term}</dt>
            <dd className="truncate text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
