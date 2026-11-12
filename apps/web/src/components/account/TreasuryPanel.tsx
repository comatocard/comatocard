"use client";
import type { TreasuryPlan } from "@comatocard/agents/treasury";
import { useQuery } from "@tanstack/react-query";
import { displayUnits } from "../../lib/units";
import { Card, Skeleton } from "../ui";

/**
 * The treasury agent's plan, as a dry run: what the cards may still spend against what the vault
 * holds, and, when short, a NEAR Intents 1Click quote for the gap. Nothing is signed or sent.
 */
export function TreasuryPanel({
  vault,
  decimals,
  symbol,
}: {
  vault: string;
  decimals: number;
  symbol: string;
}) {
  const plan = useQuery({
    queryKey: ["vault", vault, "treasury"],
    queryFn: async () => {
      const response = await fetch(`/api/treasury?vault=${encodeURIComponent(vault)}`);
      const body = (await response.json()) as TreasuryPlan | { error: string };
      if ("error" in body) throw new Error(body.error);
      return body;
    },
    staleTime: 60_000,
    retry: false,
  });

  return (
    <Card className="px-5 py-4">
      <PlanBody
        plan={plan.data}
        loading={plan.isLoading}
        error={plan.error?.message}
        decimals={decimals}
        symbol={symbol}
      />
    </Card>
  );
}

const PLAN_TITLE = {
  none: "Covered",
  top_up: "Top up suggested",
  refused: "Top up refused",
} as const;

function PlanBody({
  plan,
  loading,
  error,
  decimals,
  symbol,
}: {
  plan: TreasuryPlan | undefined;
  loading: boolean;
  error: string | undefined;
  decimals: number;
  symbol: string;
}) {
  if (loading) return <Skeleton className="h-16 w-full" />;
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!plan) return null;
  return (
    <div className="text-[13.5px]">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{PLAN_TITLE[plan.action]}</span>
        <span className="text-[12px] text-muted">dry run</span>
      </div>
      <p className="mt-1 text-muted">
        Cards may still spend {displayUnits(plan.required, decimals)} {symbol}; the vault holds{" "}
        {displayUnits(plan.available, decimals)} {symbol}.
      </p>
      {plan.action === "none" ? null : (
        <div className="mt-3 rounded-2xl bg-pill px-3.5 py-3 text-[12.5px]">
          <div>
            Short {displayUnits(plan.deficit, decimals)} {symbol}. 1Click quotes{" "}
            <b>{plan.quote.amountInFormatted}</b> wNEAR (${plan.quote.amountInUsd}) for{" "}
            {plan.quote.amountOutFormatted} USDC, slippage {plan.slippageBps / 100}%.
          </div>
          {plan.reason ? <div className="mt-1 text-neg">{plan.reason}</div> : null}
        </div>
      )}
    </div>
  );
}
