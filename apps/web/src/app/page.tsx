"use client";

import { Bot, Building2, ShieldCheck, UserRound } from "lucide-react";
import { useNearWallet } from "near-connect-hooks";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button, Toast } from "../components/ui";
import { useSession } from "../hooks/useSession";
import { readStored, STORAGE, writeStored } from "../lib/storage";
import styles from "./Onboarding.module.css";

type TourScreen = { title: string; body: string; visual: ReactNode };

/** Three beats, in the order the product works: issue a card, set its limits, read the record. */
const TOUR: TourScreen[] = [
  {
    title: "A card for every\nagent",
    body: "Give an agent a card, not your wallet. Each card is its own key that can only pay",
    visual: <CardsVisual />,
  },
  {
    title: "Limits it\ncan't change",
    body: "Per payment, per day and per month, enforced by the contract on every payment",
    visual: <LimitsVisual />,
  },
  {
    title: "Every payment\non record",
    body: "Paid, waiting for you or refused, each with its reason, on NEAR",
    visual: <RecordVisual />,
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { ready, accountId } = useSession();
  const [mode, setMode] = useState<"tour" | "connect" | null>(null);
  const [step, setStep] = useState(0);

  // A connected wallet skips onboarding. `replace` keeps `/` out of history.
  useEffect(() => {
    if (ready && accountId) router.replace("/home");
  }, [ready, accountId, router]);

  useEffect(() => {
    if (!ready || accountId) return;
    setMode(readStored(STORAGE.onboardingDone) === "1" ? "connect" : "tour");
  }, [ready, accountId]);

  if (!ready || accountId || mode === null) return <SplashScreen />;

  const finishTour = () => {
    writeStored(STORAGE.onboardingDone, "1");
    setMode("connect");
  };

  if (mode === "connect") return <ConnectScreen onBack={() => setMode("tour")} />;

  const last = step === TOUR.length - 1;
  const t = TOUR[step] ?? TOUR[0];

  return (
    <main className={`${styles.screen} ${styles.tourScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          {step > 0 ? (
            <BackButton onClick={() => setStep(step - 1)} />
          ) : (
            <span aria-hidden="true" className={styles.headerSpacer} />
          )}
          <BrandMark compact />
          <button type="button" className={styles.skipButton} onClick={finishTour}>
            Skip
          </button>
        </header>

        <section className={styles.tourBody}>
          <div key={step} className={styles.visualStage}>
            {t?.visual}
          </div>
          <div className={styles.tourCopy}>
            <h1 className={styles.tourTitle}>{t?.title}</h1>
            <p className={styles.tourText}>{t?.body}</p>
            <Stepper current={step} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          <Button onClick={() => (last ? finishTour() : setStep(step + 1))}>
            {last ? "Continue" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}

/** The last screen: connect a NEAR wallet. Setup takes over once it is connected. */
function ConnectScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { connector } = useNearWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      // The connector directly: the hook's own state is a render behind right after connecting.
      await connector.connect();
      router.replace("/home");
    } catch {
      setError("The wallet did not connect. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`${styles.screen} ${styles.tourScreen} ${styles.connectScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          <BackButton onClick={onBack} />
          <BrandMark compact />
          <span aria-hidden="true" className={styles.headerSpacer} />
        </header>

        <section className={styles.tourBody}>
          <div key="connect" className={`${styles.visualStage} ${styles.connectVisualStage}`}>
            <div className={styles.connectVisual} aria-hidden="true">
              <Float slot="float1" icon={<Bot />} />
              <Float slot="float2" icon={<UserRound />} />
              <Float slot="float3" icon={<Building2 />} />
              <Float slot="float4" icon={<ShieldCheck />} />
              <span className={styles.walletShadow} />
            </div>
          </div>
          <div className={styles.tourCopy}>
            <h1>Connect your wallet</h1>
            <p>Your vault is owned by your NEAR account. Testnet, no real money.</p>
            <Stepper current={TOUR.length} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          <Button onClick={() => void connect()} disabled={busy}>
            {busy ? "Waiting for your wallet…" : "Connect wallet"}
          </Button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className={`${styles.screen} ${styles.splashScreen}`} aria-label="Loading Comatocard">
      <BrandMark />
      <span className={styles.splashPulse} aria-hidden="true" />
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Back" onClick={onClick} className={styles.backButton}>
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}>
      <Image
        src="/comatocard-icon.svg"
        alt="Comatocard"
        width={512}
        height={512}
        className={styles.brandLogo}
        priority
      />
    </div>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div
      className={styles.stepper}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Onboarding step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => i).map((i) => (
        <span key={i} className={i === current ? styles.stepActive : ""} />
      ))}
    </div>
  );
}

function Float({
  slot,
  icon,
}: {
  slot: "float1" | "float2" | "float3" | "float4";
  icon: ReactNode;
}) {
  return (
    <span className={`${styles.walletFloat} ${styles[slot]}`}>
      <span className="grid size-full place-items-center text-ink [&_svg]:size-[46%]">{icon}</span>
    </span>
  );
}

// Illustrations of the product, not readings: the figures are labelled as an example card.
const EXAMPLE_CARDS = [
  { icon: <Bot />, name: "Research agent", kind: "Agent", limit: "20 per payment" },
  { icon: <UserRound />, name: "Field team", kind: "Person", limit: "50 per day" },
  { icon: <Building2 />, name: "Treasury", kind: "Treasury", limit: "200 per month" },
];

function CardsVisual() {
  return (
    <div className={styles.assetStack} aria-hidden="true">
      {EXAMPLE_CARDS.map((c, i) => (
        <div key={c.name} className={`${styles.assetRow} ${i === 0 ? styles.assetRowActive : ""}`}>
          <span className={`${styles.stockTile} text-ink [&_svg]:size-5`}>{c.icon}</span>
          <span className={styles.assetText}>
            <strong>{c.name}</strong>
            <span className={styles.assetChain}>{c.kind} card</span>
          </span>
          <span className={styles.assetValue}>
            <b>{c.limit}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

function LimitsVisual() {
  const bars = [18, 26, 31, 38, 44, 52, 57, 63, 70, 76, 82, 100];
  return (
    <div className={styles.chartPanel} aria-hidden="true">
      <div className={styles.chartHeader}>
        <div>
          <span>Example card, today</span>
          <strong>32 of 50 tUSD</strong>
        </div>
        <b>limit enforced on chain</b>
      </div>
      <div className={styles.earningBars}>
        {bars.map((height) => (
          <span key={height} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function RecordVisual() {
  return (
    <div className={styles.agentPanel} aria-hidden="true">
      <div className={styles.phoneMock}>
        <div className={styles.phoneIsland} />
        <div className={styles.phoneContent}>
          <div className={styles.homeHeroMini}>
            <span>Vault balance</span>
            <b>tUSD</b>
            <em>on NEAR</em>
          </div>
          <div className={styles.homeButtonMini}>Approve</div>
          <span className={styles.homeSectionMini}>Research agent</span>
          <div className={styles.cardMini}>
            <span className={styles.cardMiniChip} />
            <b>Comatocard</b>
            <em>•••• •••• •••• 0001</em>
          </div>
        </div>
      </div>
      <div className={styles.safeExitCard}>
        <span className={styles.safeExitIcon}>
          <svg
            aria-hidden="true"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
        <div className={styles.safeExitText}>
          <strong>Refused: per payment limit</strong>
          <span>Recorded on chain with its reason</span>
        </div>
        <b>NEAR</b>
      </div>
    </div>
  );
}
