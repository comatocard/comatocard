import type { PaymentRow as Row } from "@comatocard/sdk";
import { txUrl } from "../../lib/config";
import { ago } from "../../lib/format";
import { nsToMs, paymentDetail, STATUS_TITLE, STATUS_TONE } from "../../lib/payments";
import { displayUnits } from "../../lib/units";

const TONE_CLASS = {
  ok: "bg-pill text-pill-ink",
  wait: "bg-warn-soft text-warn",
  bad: "bg-[#f8e9e7] text-neg",
  neutral: "bg-pill text-pill-ink",
} as const;

function StatusIcon({ tone }: { tone: keyof typeof TONE_CLASS }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (tone === "bad") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  if (tone === "wait") {
    return (
      <svg aria-hidden="true" {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" {...common}>
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M5 3h14" />
    </svg>
  );
}

/** One payment attempt: what happened, to whom, how much, and why when it did not settle. */
export function PaymentRow({
  row,
  decimals,
  symbol,
  now,
  first,
  cardLabel,
}: {
  row: Row;
  decimals: number;
  symbol: string;
  now: number | null;
  first: boolean;
  cardLabel: string | undefined;
}) {
  const tone = STATUS_TONE[row.status];
  const detail = paymentDetail(row);
  const when = now ? ago(nsToMs(row.created_at), now) : "";
  const className = `flex items-center gap-[13px] py-3.5 ${first ? "" : "border-t border-line"}`;
  const body = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${TONE_CLASS[tone]}`}>
        <StatusIcon tone={tone} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 truncate text-[13.5px] font-semibold">
            {STATUS_TITLE[row.status]} · {row.merchant}
          </div>
          <div
            className={`shrink-0 text-[13.5px] font-semibold tabular-nums ${tone === "bad" ? "text-muted line-through decoration-1" : ""}`}
          >
            {displayUnits(row.amount, decimals)} {symbol}
          </div>
        </div>
        <div className="mt-0.5 flex items-start justify-between gap-3 text-xs text-muted">
          <span className="min-w-0 truncate">
            {[cardLabel, detail].filter(Boolean).join(" · ") || row.reference || " "}
          </span>
          {when ? <span className="shrink-0 font-medium">{when}</span> : null}
        </div>
      </div>
    </>
  );
  return row.tx_hash ? (
    <a
      href={txUrl(row.tx_hash)}
      target="_blank"
      rel="noreferrer"
      className={`${className} text-inherit no-underline`}
    >
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
