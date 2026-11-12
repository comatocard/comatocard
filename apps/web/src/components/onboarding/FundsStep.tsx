"use client";
import { useTopUp } from "../../hooks/setup";
import { QUICK_AMOUNTS } from "../../lib/setup-flow";
import { cn } from "../../lib/utils";
import { GhostButton, SignButton, StepFooter, StepHead } from "./StepParts";

/** Step two: mint test tokens and deposit them into the card account in one signature. */
export function FundsStep({
  owner,
  vault,
  amount,
  onAmount,
  onDone,
  onSkip,
}: {
  owner: string;
  vault: string;
  amount: string;
  onAmount: (amount: string) => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { topUp, error, symbol, ready, state } = useTopUp(owner, vault);

  return (
    <>
      <StepHead
        kicker="Step 2 of 3"
        title="Add funds"
        sub="Cards spend from here only."
        tip={`${symbol || "The test token"} is the testnet stablecoin. Its faucet mints to you, then one deposit moves it into the card account.`}
      />
      <div className="mt-6 space-y-3">
        <label
          data-reveal
          className="flex h-[72px] items-center justify-between rounded-[16px] border-[1.5px] border-ink bg-white px-5 lg:h-20"
        >
          <span className="sr-only">Amount</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="w-full bg-transparent text-[34px] font-semibold tracking-[-.03em] tabular-nums outline-none lg:text-[40px]"
          />
          <span className="text-[15px] font-semibold text-muted">{symbol}</span>
        </label>
        {error ? <p className="text-[12.5px] text-neg">{error}</p> : null}
        <div data-reveal className="flex gap-2">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onAmount(value)}
              aria-pressed={amount === value}
              className={cn(
                "h-10 flex-1 rounded-full border text-[14px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[.97]",
                amount === value
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-ink hover:border-line-2",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <StepFooter
        state={state}
        secondary={<GhostButton onClick={onSkip}>Skip for now</GhostButton>}
      >
        <SignButton
          state={state}
          disabled={!ready || !amount}
          onClick={() => void topUp(amount).then((ok) => ok && onDone())}
        >
          Add {amount || "0"} {symbol}
        </SignButton>
      </StepFooter>
    </>
  );
}
