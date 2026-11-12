"use client";
import { cardEnv } from "../../lib/setup-flow";
import { Button, CopyButton } from "../ui";
import { GhostButton, StepFooter, StepHead } from "./StepParts";

/** The last screen: the card key for the agent, shown once, and the way into the app. */
export function DoneStep({
  vault,
  secret,
  onFinish,
  onAnother,
}: {
  vault: string;
  secret: string;
  onFinish: () => void;
  onAnother: () => void;
}) {
  const env = cardEnv(vault, secret);
  return (
    <>
      <StepHead
        title="You're set"
        sub="Give this to your agent. Shown once."
        tip="The card's secret key. It is not stored anywhere, here or on chain. The card can only call pay, inside its limits."
      />
      <div data-reveal className="mt-6 flex items-center gap-3 rounded-[16px] bg-[#0b0c0d] p-4">
        <pre className="min-w-0 flex-1 overflow-hidden font-mono text-[12px] leading-[1.7] text-white/70">
          {env
            .trim()
            .split("\n")
            .map((line) => (
              <span key={line} className="block truncate">
                {line}
              </span>
            ))}
        </pre>
        <CopyButton
          value={env}
          label="Copy the card key"
          className="shrink-0 rounded-[10px] bg-white/10 px-3 py-2 text-[13px] font-semibold text-white"
        />
      </div>
      <StepFooter secondary={<GhostButton onClick={onAnother}>Issue another card</GhostButton>}>
        <Button onClick={onFinish}>Go to my cards</Button>
      </StepFooter>
    </>
  );
}
