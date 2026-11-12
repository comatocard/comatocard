import { BadgeCheck, Clock3, Cpu, XCircle, Zap } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { cardNumber } from "../../lib/cards";
import { CardArtwork } from "../card/CardArtwork";
import { InfoTip } from "../ui";

const FACTS: { icon: ReactNode; text: string; tip: string }[] = [
  {
    icon: <BadgeCheck />,
    text: "Reviewed contract",
    tip: "An independent review on 11 Nov 2026 found three high and four medium issues; all are fixed in vault 0.4.0, each with a regression test.",
  },
  {
    icon: <Cpu />,
    text: "Verified in a TEE",
    tip: "The policy assistant runs in a TEE on NEAR AI Cloud; its attestation is checked before an answer is shown.",
  },
  {
    icon: <Zap />,
    text: "Gasless owner actions",
    tip: "Freeze, limits and approvals are signed as delegate actions and sent by the relayer, which pays the gas.",
  },
];

function Notice({
  icon,
  title,
  body,
  tone,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] bg-white px-4 py-3 text-left shadow-[0_18px_40px_-20px_rgba(17,19,22,.35)]">
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-4 ${tone}`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="block text-[12px] text-muted">{body}</span>
      </span>
    </div>
  );
}

/** Each payment ends one of three ways, and the contract, not the agent, picks which. */
export function Decisions() {
  return (
    <section id="security" className="overflow-hidden bg-white px-5 py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1180px] items-center gap-14 lg:grid-cols-2">
        <div>
          <h2
            data-scroll
            className="text-[36px] font-semibold leading-[1.05] tracking-[-.03em] lg:text-[52px]"
          >
            The contract decides.
            <br />
            Not the prompt.
          </h2>
          <p data-scroll className="mt-4 text-[16px] text-muted">
            It settles, waits for you, or gets refused.
          </p>
          <ul data-scroll className="mt-7 flex flex-wrap gap-x-5 gap-y-3">
            {FACTS.map((fact) => (
              <li key={fact.text} className="flex items-center gap-1.5 text-[13px] font-medium">
                <span className="text-pos [&_svg]:size-4">{fact.icon}</span>
                {fact.text}
                <InfoTip label={fact.text}>{fact.tip}</InfoTip>
              </li>
            ))}
          </ul>
        </div>
        <div data-scroll className="relative mx-auto w-full max-w-[460px] py-14" aria-hidden="true">
          <div className="absolute top-6 right-0 left-10 aspect-[1.586] -rotate-3 overflow-hidden rounded-[18px] opacity-70">
            <CardArtwork
              label="Field team"
              number={cardNumber(1)}
              expiry="None"
              kind="human"
              frozen={false}
              detailsVisible={false}
            />
          </div>
          <div className="relative aspect-[1.586] w-[88%] rotate-2 overflow-hidden rounded-[18px] shadow-[0_40px_60px_-30px_rgba(0,0,0,.6)]">
            <CardArtwork
              label="Research agent"
              number={cardNumber(0)}
              expiry="None"
              kind="agent"
              frozen={false}
              detailsVisible={false}
            />
          </div>
          <div className="absolute -top-2 left-0 w-[260px]">
            <Notice
              icon={<XCircle />}
              title="Refused on chain"
              body="25 tUSD, above per payment limit"
              tone="bg-neg/10 text-neg"
            />
          </div>
          <div className="absolute right-0 -bottom-2 w-[260px]">
            <Notice
              icon={<Clock3 />}
              title="Research agent wants 15 tUSD"
              body="Above your approval threshold"
              tone="bg-warn-soft text-warn"
            />
          </div>
          <Image
            data-float
            src="/landing/lock.png"
            alt=""
            width={360}
            height={360}
            className="absolute top-[30%] -right-6 w-20 lg:w-24"
          />
          <Image
            data-float
            src="/landing/shield.png"
            alt=""
            width={360}
            height={360}
            className="absolute bottom-[22%] -left-4 w-16 lg:w-20"
          />
        </div>
      </div>
    </section>
  );
}
