"use client";
import { useEffect } from "react";
import { useIssueCard } from "../../hooks/setup";
import { SmoothHeight } from "../../lib/motion/SmoothHeight";
import { type FirstCardLimits, firstCardForm } from "../../lib/setup-flow";
import { cn } from "../../lib/utils";
import { Field } from "../form/Field";
import { InfoTip } from "../ui";
import { GhostButton, SignButton, StepFooter, StepHead } from "./StepParts";

const LIMITS = [
  ["perTx", "Payment"],
  ["daily", "Day"],
  ["monthly", "30 days"],
] as const;

const ASK_DEFAULT = "10";

/** Step three: name the first card and set its three limits; the rest keeps safe defaults. */
export function CardStep({
  vault,
  label,
  onLabel,
  limits,
  onLimits,
  onIssued,
  onSkip,
}: {
  vault: string;
  label: string;
  onLabel: (label: string) => void;
  limits: FirstCardLimits;
  onLimits: (limits: FirstCardLimits) => void;
  onIssued: (secret: string) => void;
  onSkip: () => void;
}) {
  const { issue, error, symbol, ready, state, retryDirect, secret } = useIssueCard(vault);
  const asking = limits.askAbove !== "";
  const limitError = error && error.field !== "label" ? error.message : null;

  // The secret goes up once the card exists on chain, and only then.
  useEffect(() => {
    if (state.status === "confirmed" && secret) onIssued(secret);
  }, [state.status, secret, onIssued]);

  return (
    <>
      <StepHead
        kicker="Step 3 of 3"
        title="Issue your first card"
        sub="Pays only inside these limits."
        tip="A key that can only pay from the card account. Whoever holds it can't change the limits. Merchants and expiry are on the card page."
      />
      <SmoothHeight className="mt-6">
        <div className="space-y-3">
          <div data-reveal>
            <Field
              label="Card name"
              placeholder="Research agent"
              value={label}
              onChange={(e) => onLabel(e.target.value)}
              error={error?.field === "label" ? error.message : null}
            />
          </div>
          <div data-reveal className="grid grid-cols-3 gap-2">
            {LIMITS.map(([key, name]) => (
              <label
                key={key}
                className={cn(
                  "rounded-[16px] bg-card px-3.5 py-3 ring-ink transition-shadow focus-within:ring-[1.5px]",
                  error?.field === key && "ring-[1.5px] ring-neg",
                )}
              >
                <span className="block text-[12px] font-medium text-muted">{name}</span>
                <input
                  inputMode="decimal"
                  value={limits[key]}
                  onChange={(e) => onLimits({ ...limits, [key]: e.target.value })}
                  className="mt-0.5 w-full bg-transparent text-[20px] font-semibold tracking-[-.02em] tabular-nums outline-none lg:text-[22px]"
                  aria-label={`${name} limit in ${symbol}`}
                />
              </label>
            ))}
          </div>
          {limitError ? <p className="text-[12.5px] text-neg">{limitError}</p> : null}
          <div
            data-reveal
            className="flex items-center justify-between rounded-[16px] bg-card px-4 py-3 text-[14px]"
          >
            <span className="flex items-center gap-1.5 font-medium">
              Ask me above {limits.askAbove || ASK_DEFAULT}
              <InfoTip label="Ask me above">
                Payments above this wait for your approval instead of settling. Off means every
                payment inside the limits settles.
              </InfoTip>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={asking}
              aria-label="Ask me before large payments"
              onClick={() => onLimits({ ...limits, askAbove: asking ? "" : ASK_DEFAULT })}
              className={cn(
                "relative h-[26px] w-11 rounded-full transition-colors duration-200",
                asking ? "bg-pos" : "bg-line-2",
              )}
            >
              <span
                className={cn(
                  "absolute top-[3px] left-[3px] size-5 rounded-full bg-white shadow-sm transition-transform duration-200 [transition-timing-function:cubic-bezier(.23,1,.32,1)]",
                  asking && "translate-x-[18px]",
                )}
              />
            </button>
          </div>
        </div>
      </SmoothHeight>
      <StepFooter
        state={state}
        onDirect={retryDirect}
        secondary={<GhostButton onClick={onSkip}>Skip for now</GhostButton>}
      >
        <SignButton
          state={state}
          disabled={!ready}
          onClick={() => void issue({ label, kind: "agent", form: firstCardForm(limits) })}
        >
          Issue card
        </SignButton>
      </StepFooter>
    </>
  );
}
