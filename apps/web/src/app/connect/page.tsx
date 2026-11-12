"use client";

import { ArrowRight } from "lucide-react";
import { useNearWallet } from "near-connect-hooks";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FloatingCard } from "../components/onboarding/FloatingCard";
import { PanelGlow, Wordmark } from "../components/onboarding/SetupLayout";
import { InfoTip, Toast } from "../components/ui";
import { Loader } from "../components/ui/Loader";
import { useSession } from "../hooks/useSession";
import { useReveal } from "../lib/motion/useReveal";

/** Wallets offered by name on a desktop; any other one is still in the connector's own list. */
const WALLETS = [
  { id: "meteor-wallet", name: "Meteor Wallet", logo: "/onboarding/meteor.png" },
  { id: "hot-wallet", name: "HOT Wallet", logo: null },
  { id: "mynearwallet", name: "MyNearWallet", logo: null },
] as const;

const TITLE = "Cards your agents\ncan't overspend.";
const SUB = "Limits live on chain. You hold the keys.";
const WALLET_TIP =
  "Your card account is owned by the NEAR account you connect. Testnet only, no real money.";

/**
 * The way in: connect a NEAR wallet. A connected wallet goes straight to the app, which sends a
 * first-time owner on to setup.
 */
export default function ConnectPage() {
  const router = useRouter();
  const { ready, accountId } = useSession();
  const { connector } = useNearWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const showing = ready && !accountId;
  useReveal(root, showing);

  useEffect(() => {
    if (ready && accountId) router.replace("/home");
  }, [ready, accountId, router]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const connect = async (walletId?: string) => {
    setBusy(walletId ?? "any");
    setError(null);
    try {
      // The connector directly: the hook's own state is a render behind right after connecting.
      await connector.connect(walletId ? { walletId } : undefined);
      router.replace("/home");
    } catch {
      setError("The wallet did not connect. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!showing) return <Splash />;

  return (
    <main
      ref={root}
      className="relative flex min-h-dvh flex-col bg-[#0b0c0d] text-white lg:grid lg:grid-cols-[minmax(440px,42%)_1fr] lg:bg-bg"
    >
      <section className="relative flex flex-1 flex-col overflow-hidden bg-[#0b0c0d] px-6 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] lg:px-14 lg:py-10">
        <PanelGlow />
        <header className="relative flex items-center justify-between">
          <Wordmark />
          <span className="flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[.08] px-3 text-[12px] font-semibold text-white/80">
            <span className="size-1.5 rounded-full bg-[#4ade80]" />
            Testnet
          </span>
        </header>
        <div className="relative flex flex-1 items-center py-10">
          <FloatingCard />
        </div>
        <div className="relative space-y-3">
          <h1
            data-reveal
            className="text-[34px] font-semibold leading-[1.06] tracking-[-.03em] whitespace-pre-line lg:text-[44px]"
          >
            {TITLE}
          </h1>
          <p data-reveal className="text-[15px] text-white/60 lg:text-[16px]">
            {SUB}
          </p>
        </div>
        <div data-reveal className="relative mt-8 space-y-3.5 lg:hidden">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy !== null}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-ink transition-transform duration-150 active:scale-[.97] disabled:opacity-70"
          >
            {busy ? <Loader className="size-[18px]" /> : null}
            {busy ? "Waiting for your wallet" : "Connect wallet"}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-[13px] text-white/50">
            Any NEAR wallet
            <InfoTip label="Wallets">{WALLET_TIP}</InfoTip>
          </p>
        </div>
      </section>

      <section className="hidden items-center justify-center px-16 text-ink lg:flex">
        <div className="w-full max-w-[420px] space-y-7">
          <header className="space-y-2.5">
            <h2 data-reveal className="text-[36px] font-semibold leading-[1.1] tracking-[-.02em]">
              Connect your wallet
            </h2>
            <p data-reveal className="flex items-center gap-1.5 text-[16px] text-muted">
              Any NEAR wallet works.
              <InfoTip label="Wallets">{WALLET_TIP}</InfoTip>
            </p>
          </header>
          <ul className="space-y-2.5">
            {WALLETS.map((w) => (
              <li key={w.id} data-reveal>
                <button
                  type="button"
                  onClick={() => void connect(w.id)}
                  disabled={busy !== null}
                  className="group flex h-[60px] w-full items-center gap-3 rounded-[16px] border border-line bg-white px-4 text-left transition-[border-color,transform] duration-150 hover:border-line-2 active:scale-[.985] disabled:opacity-60"
                >
                  <WalletIcon name={w.name} logo={w.logo} />
                  <span className="flex-1 text-[15px] font-semibold">{w.name}</span>
                  {busy === w.id ? (
                    <Loader className="size-4 text-ink" />
                  ) : (
                    <ArrowRight className="size-4 text-faint transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            data-reveal
            type="button"
            onClick={() => void connect()}
            disabled={busy !== null}
            className="w-full text-center text-[14px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Other wallets
          </button>
        </div>
      </section>
      <Toast open={!!error} message={error ?? ""} />
    </main>
  );
}

function WalletIcon({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return (
      <span className="grid size-8 place-items-center rounded-[9px] bg-[#0b0c0d]">
        <Image src={logo} alt="" width={20} height={18} className="h-[18px] w-auto" />
      </span>
    );
  }
  return (
    <span className="grid size-8 place-items-center rounded-[9px] bg-pill text-[14px] font-bold">
      {name[0]}
    </span>
  );
}

/** While the wallet connector wakes up: the mark alone, so the screen never flashes. */
function Splash() {
  return (
    <main
      aria-label="Loading Comatocard"
      className="grid min-h-dvh place-items-center bg-[#0b0c0d] text-white"
    >
      <Loader className="size-6 text-white/80" />
    </main>
  );
}
