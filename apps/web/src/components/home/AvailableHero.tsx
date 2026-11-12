"use client";
import { displayUnits } from "../../lib/units";
import { InfoTip } from "../ui";

/**
 * Home's headline: what the vault can pay right now, its available balance of the settlement
 * token. An unread figure is a dash; `0` is a claim about someone's money.
 */
export function AvailableHero({
  available,
  reserved,
  decimals,
  symbol,
}: {
  available: string | undefined;
  reserved: string | undefined;
  decimals: number | undefined;
  symbol: string;
}) {
  const known = available !== undefined && decimals !== undefined;
  return (
    <div className="py-[26px]">
      <div className="flex items-center gap-1.5 text-[15px] font-medium text-muted">
        Available
        <InfoTip label="Available">
          What the vault can pay out now, read from the contract. Funds reserved for payments in
          flight are shown apart and come back if a payment fails.
        </InfoTip>
      </div>
      {known ? (
        <div className="mt-2 flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[clamp(30px,10vw,50px)] font-semibold leading-[1.1] tracking-[-.02em] [font-variant-numeric:tabular-nums]">
            {displayUnits(available, decimals)}
          </span>
          <span className="text-[18px] font-semibold text-muted">{symbol}</span>
        </div>
      ) : (
        <div className="mt-2 text-[clamp(32px,12vw,54px)] font-semibold leading-none">—</div>
      )}
      {known && reserved !== undefined && reserved !== "0" ? (
        <div className="mt-1.5 text-[13px] text-muted">
          {displayUnits(reserved, decimals)} {symbol} reserved for payments in flight
        </div>
      ) : null}
    </div>
  );
}
