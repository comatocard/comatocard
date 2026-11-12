import { displayUnits, ratio } from "../../lib/units";

/** Spent against a limit, as a thin bar with both figures. Full turns the bar red. */
export function SpendBar({
  label,
  spent,
  limit,
  decimals,
  symbol,
}: {
  label: string;
  spent: string;
  limit: string;
  decimals: number;
  symbol: string;
}) {
  const r = ratio(spent, limit);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-muted">{label}</span>
        <span className="tabular-nums text-ink-2">
          <b className="font-semibold">{displayUnits(spent, decimals)}</b>
          <span className="text-muted">
            {" "}
            / {displayUnits(limit, decimals)} {symbol}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${r >= 1 ? "bg-neg" : "bg-ink"}`}
          style={{ width: `${Math.max(r * 100, r > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}
