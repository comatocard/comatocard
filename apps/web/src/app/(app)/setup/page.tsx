"use client";
import gsap from "gsap";
import { Building2, CreditCard, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NewCardSheet } from "../../../components/cards/NewCardSheet";
import { CreateVaultSheet } from "../../../components/home/CreateVaultSheet";
import { TopUpSheet } from "../../../components/home/TopUpSheet";
import { VaultPicker } from "../../../components/home/VaultPicker";
import { Button } from "../../../components/ui";
import { tokenBalance, useBalances, useCards } from "../../../hooks/data";
import { useOwnership } from "../../../hooks/useOwnership";
import { useVault } from "../../../hooks/useVault";

type Sheet = "account" | "funds" | "card" | null;

interface StepCopy {
  icon: ReactNode;
  title: string;
  body: string;
  action: string;
  doneText: string;
  sheet: Exclude<Sheet, null>;
}

const STEPS: StepCopy[] = [
  {
    icon: <Building2 />,
    title: "Create your card account",
    body: "It holds the money your cards spend, as its own NEAR account that only you control. 0.5 NEAR from your wallet pays its storage and card gas.",
    action: "Create a card account",
    doneText: "Your card account is ready.",
    sheet: "account",
  },
  {
    icon: <Wallet />,
    title: "Add test funds",
    body: "Mint tUSD, the testnet stablecoin, and deposit it into your card account. Cards spend from it only.",
    action: "Top up",
    doneText: "Funds are in.",
    sheet: "funds",
  },
  {
    icon: <CreditCard />,
    title: "Issue your first card",
    body: "A key that can only pay, inside limits you set. Give it to an agent or a person; they can't change the limits.",
    action: "New card",
    doneText: "Your first card is live.",
    sheet: "card",
  },
];

const SLIDE = 48;

/** The progress dot: long for the current step, dark once a step is done. */
function dotClass(current: boolean, finished: boolean): string {
  if (current) return "w-6 bg-ink";
  return finished ? "w-1.5 bg-ink/60" : "w-1.5 bg-line-2";
}

/** True when the visitor asked the system for less motion. */
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * First run for a connected wallet, one step per screen: create the card account, fund it from the
 * test faucet, issue the first card. Each step reads its state from the chain, so a reload resumes
 * at the first step that is not done. Moving between steps slides with GSAP.
 */
export default function SetupPage() {
  const router = useRouter();
  const { vaultId } = useVault();
  const { isOwner, accountId } = useOwnership(vaultId);
  const vault = isOwner ? vaultId : null;
  const balances = useBalances(vault);
  const cards = useCards(vault);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);

  const done = [
    vault !== null,
    BigInt(tokenBalance(balances.data)?.available ?? "0") > 0n,
    (cards.data?.length ?? 0) > 0,
  ];
  const firstOpen = done.findIndex((d) => !d);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const panel = useRef<HTMLDivElement>(null);
  const resumed = useRef(false);

  // Resume at the first step that is not done, once the chain has answered.
  useEffect(() => {
    if (resumed.current || balances.isLoading || cards.isLoading) return;
    resumed.current = true;
    setStep(firstOpen === -1 ? STEPS.length - 1 : firstOpen);
  }, [firstOpen, balances.isLoading, cards.isLoading]);

  // The new step slides in from the side it came from.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    el.dataset.step = String(step);
    if (reducedMotion()) {
      gsap.set(el, { autoAlpha: 1, x: 0 });
      return;
    }
    gsap.fromTo(
      el,
      { autoAlpha: 0, x: direction * SLIDE },
      { autoAlpha: 1, x: 0, duration: 0.45, ease: "power3.out" },
    );
  }, [step, direction]);

  const go = (next: number) => {
    if (next < 0 || next >= STEPS.length || next === step) return;
    const dir = next > step ? 1 : -1;
    const el = panel.current;
    const swap = () => {
      setDirection(dir);
      setStep(next);
    };
    if (!el || reducedMotion()) return swap();
    gsap.to(el, {
      autoAlpha: 0,
      x: -dir * SLIDE,
      duration: 0.22,
      ease: "power2.in",
      onComplete: swap,
    });
  };

  const current = STEPS[step] ?? STEPS[0];
  const isDone = done[step] === true;
  const last = step === STEPS.length - 1;
  // A step needs the card account first; the account step is always open.
  const enabled = step === 0 || done[0] === true;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[480px] flex-col">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">
          Step {step + 1} of {STEPS.length}
        </span>
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-label="Setup progress"
        >
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full transition-all duration-300 ${dotClass(i === step, done[i] === true)}`}
            />
          ))}
        </div>
      </div>

      <div ref={panel} className="flex flex-1 flex-col pt-10">
        <span className="grid size-16 place-items-center rounded-[20px] border border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_14px_28px_-16px_rgba(17,19,22,.35)] [&_svg]:size-7">
          {current?.icon}
        </span>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-.02em]">
          {current?.title}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{current?.body}</p>

        {isDone ? (
          <div className="mt-6 flex items-center gap-2.5 rounded-[16px] border border-line bg-white px-4 py-3 text-[14px] font-medium">
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-full bg-ink text-[12px] text-white"
            >
              ✓
            </span>
            {current?.doneText}
          </div>
        ) : null}

        {step === 0 && !isDone ? (
          <div className="mt-6">
            <VaultPicker
              owner={accountId}
              onCreate={() => setSheet("account")}
              label="Already have a card account?"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-8 space-y-2.5 pb-4">
        {isDone ? (
          <Button onClick={() => (last ? router.replace("/home") : go(step + 1))}>
            {last ? "Go to my cards" : "Next"}
          </Button>
        ) : (
          <Button onClick={() => current && setSheet(current.sheet)} disabled={!enabled}>
            {current?.action}
          </Button>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            className="h-11 px-1 text-[14px] font-semibold text-muted disabled:invisible"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (last || !done[0] ? router.replace("/home") : go(step + 1))}
            disabled={!done[0]}
            className="h-11 px-1 text-[14px] font-semibold text-muted disabled:invisible"
          >
            {last ? "Skip to my cards" : "Skip"}
          </button>
        </div>
      </div>

      {accountId ? (
        <CreateVaultSheet open={sheet === "account"} onClose={close} owner={accountId} />
      ) : null}
      {vault && accountId ? (
        <>
          <TopUpSheet open={sheet === "funds"} onClose={close} owner={accountId} vault={vault} />
          <NewCardSheet open={sheet === "card"} onClose={close} vault={vault} />
        </>
      ) : null}
    </div>
  );
}
