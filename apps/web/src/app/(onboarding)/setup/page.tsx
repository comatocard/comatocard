"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountStep } from "../../../components/onboarding/AccountStep";
import { CardStep } from "../../../components/onboarding/CardStep";
import { DoneStep } from "../../../components/onboarding/DoneStep";
import { FundsStep } from "../../../components/onboarding/FundsStep";
import { SetupLayout } from "../../../components/onboarding/SetupLayout";
import { SetupSkeleton } from "../../../components/onboarding/SetupSkeleton";
import { type Stage, StageCard } from "../../../components/onboarding/StageCard";
import { ReadyNote, StepFooter, StepHead } from "../../../components/onboarding/StepParts";
import { Button } from "../../../components/ui";
import { tokenBalance, useBalances, useCards, useOwnerVaults, useToken } from "../../../hooks/data";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { useOwnership } from "../../../hooks/useOwnership";
import { useVault } from "../../../hooks/useVault";
import { FACTORY_ID } from "../../../lib/config";
import { useReveal } from "../../../lib/motion/useReveal";
import { useStepSwap } from "../../../lib/motion/useStepSwap";
import { DONE_STEP, FIRST_CARD_LIMITS, resumeStep, SETUP_STEPS } from "../../../lib/setup-flow";

const shortName = (vault: string) => vault.replace(`.${FACTORY_ID}`, "");

function stageFor(step: number, done: readonly boolean[], fundedNow: boolean): Stage {
  if (step >= DONE_STEP) return "done";
  if (step === 2) return "card";
  if (!done[0]) return "empty";
  return fundedNow ? "funded" : "account";
}

/**
 * First run for a connected wallet: open the card account, fund it, issue the first card, then
 * hand over its key. Each step reads the chain, so a reload resumes at the first one not done.
 */
export default function SetupPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { vaultId, setVaultId } = useVault();
  const { isOwner, owner, accountId, config } = useOwnership(vaultId);
  const owned = useOwnerVaults(vaultId ? null : accountId);
  const vault = isOwner ? vaultId : null;
  const balances = useBalances(vault);
  const cards = useCards(vault);
  const token = useToken();

  // Keep to a vault this wallet owns: drop someone else's, open the wallet's first one.
  const foreign = Boolean(vaultId && owner && owner !== accountId);
  const firstOwned = owned.data?.[0]?.vault_id ?? null;
  useEffect(() => {
    if (foreign) setVaultId(null);
  }, [foreign, setVaultId]);
  useEffect(() => {
    if (!vaultId && firstOwned) setVaultId(firstOwned);
  }, [vaultId, firstOwned, setVaultId]);

  const done = [
    vault !== null,
    BigInt(tokenBalance(balances.data)?.available ?? "0") > 0n,
    (cards.data?.length ?? 0) > 0,
  ];
  const loading =
    config.isLoading || owned.isLoading || balances.isLoading || cards.isLoading || foreign;

  const [step, setStep] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("100");
  const [fundedNow, setFundedNow] = useState(false);
  const [label, setLabel] = useState("");
  const [limits, setLimits] = useState(FIRST_CARD_LIMITS);
  const [secret, setSecret] = useState<string | null>(null);

  // Resume once the chain has answered: the first step not done, or home if all are.
  const resumed = useRef(false);
  const resume = resumeStep(done);
  useEffect(() => {
    if (resumed.current || loading) return;
    resumed.current = true;
    if (resume === "complete") router.replace("/home");
    else setStep(resume);
  }, [loading, resume, router]);

  const panel = useRef<HTMLDivElement>(null);
  const current = step ?? 0;
  const swap = useStepSwap(panel, current);
  useReveal(panel, current);
  const go = useCallback((next: number) => swap(next, () => setStep(next)), [swap]);
  const onIssued = useCallback(
    (key: string) => {
      setSecret(key);
      go(DONE_STEP);
    },
    [go],
  );

  if (step === null || !accountId) return <SetupSkeleton />;

  const symbol = token.data?.symbol ?? "";
  const account = vault ? shortName(vault) : name;
  const back = step > 0 && step < DONE_STEP ? () => go(step - 1) : null;

  return (
    <SetupLayout
      step={step}
      done={done}
      panel={panel}
      onBack={back}
      stage={
        <StageCard
          stage={stageFor(step, done, fundedNow)}
          account={account}
          label={label}
          amount={amount}
          symbol={symbol}
          perTx={limits.perTx}
          tone={isDesktop ? "dark" : "light"}
        />
      }
    >
      {renderStep()}
    </SetupLayout>
  );

  function renderStep() {
    const id = accountId ?? "";
    if (step === DONE_STEP && vault && secret) {
      return (
        <DoneStep
          vault={vault}
          secret={secret}
          onFinish={() => router.replace("/home")}
          onAnother={() => {
            setSecret(null);
            setLabel("");
            go(2);
          }}
        />
      );
    }
    if (step === 0 && !done[0]) {
      return <AccountStep owner={id} name={name} onName={setName} onDone={() => go(1)} />;
    }
    if (!vault) return null;
    if (step === 1 && !done[1]) {
      return (
        <FundsStep
          owner={id}
          vault={vault}
          amount={amount}
          onAmount={setAmount}
          onDone={() => {
            setFundedNow(true);
            go(2);
          }}
          onSkip={() => go(2)}
        />
      );
    }
    if (step === 2) {
      return (
        <CardStep
          vault={vault}
          label={label}
          onLabel={setLabel}
          limits={limits}
          onLimits={setLimits}
          onIssued={onIssued}
          onSkip={() => router.replace("/home")}
        />
      );
    }
    return <ReadyStep step={step ?? 0} vault={vault} onNext={() => go((step ?? 0) + 1)} />;
  }
}

/** A step the chain already has done, reached by going back. */
function ReadyStep({ step, vault, onNext }: { step: number; vault: string; onNext: () => void }) {
  const name = SETUP_STEPS[step] ?? "";
  return (
    <>
      <StepHead
        kicker={`Step ${step + 1} of 3`}
        title={`${name} ready`}
        sub="Nothing to do here."
        tip={`Done for ${vault}. Carry on to the next step.`}
      />
      <div className="mt-6">
        <ReadyNote>{step === 0 ? shortName(vault) : "Funds are in"}</ReadyNote>
      </div>
      <StepFooter>
        <Button onClick={onNext}>Continue</Button>
      </StepFooter>
    </>
  );
}
