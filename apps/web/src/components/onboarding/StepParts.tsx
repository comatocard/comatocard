"use client";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { ActionState } from "../../hooks/useOwnerAction";
import { SmoothHeight } from "../../lib/motion/SmoothHeight";
import { ActionStatus } from "../form/ActionStatus";
import { Button, InfoTip } from "../ui";
import { Loader } from "../ui/Loader";

/** Title, one short line, and the longer explanation behind an info tip. */
export function StepHead({
  kicker,
  title,
  sub,
  tip,
}: {
  kicker?: string;
  title: string;
  sub: string;
  tip: ReactNode;
}) {
  return (
    <header className="space-y-2">
      {kicker ? (
        <p data-reveal className="hidden text-[13px] font-semibold text-muted lg:block">
          {kicker}
        </p>
      ) : null}
      <h1
        data-reveal
        className="text-[28px] font-semibold leading-[1.1] tracking-[-.02em] lg:text-[36px]"
      >
        {title}
      </h1>
      <p data-reveal className="flex items-center gap-1.5 text-[15px] text-muted lg:text-[16px]">
        {sub}
        <InfoTip label={title}>{tip}</InfoTip>
      </p>
    </header>
  );
}

/** The step's main button: it shows a spinner while the wallet is open. */
export function SignButton({
  state,
  disabled,
  onClick,
  children,
}: {
  state: ActionState;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const busy = state.status === "signing" || state.status === "confirming";
  return (
    <Button onClick={onClick} disabled={disabled || busy} aria-busy={busy}>
      {busy ? (
        <>
          <Loader className="size-[18px] text-white" />
          Confirm in your wallet
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Bottom of a step: the actions, and the status line under them. The status grows the block
 * smoothly instead of pushing the buttons in one jump.
 */
export function StepFooter({
  children,
  secondary,
  state,
  onDirect,
}: {
  children: ReactNode;
  secondary?: ReactNode;
  state?: ActionState;
  onDirect?: () => void;
}) {
  const retry = onDirect ? { onDirect } : {};
  return (
    <footer data-reveal className="mt-auto space-y-3 pt-8 pb-2 lg:mt-0">
      <div className="flex items-center gap-2.5">{children}</div>
      {secondary ? <div className="flex justify-center">{secondary}</div> : null}
      <SmoothHeight>{state ? <ActionStatus state={state} {...retry} /> : null}</SmoothHeight>
    </footer>
  );
}

/** A quiet text button for the secondary action under the main one. */
export function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 px-2 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Shown on a step the chain already has done, when the owner comes back to it. */
export function ReadyNote({ children }: { children: ReactNode }) {
  return (
    <div
      data-reveal
      className="flex items-center gap-2.5 rounded-[16px] border border-line bg-white px-4 py-3 text-[14px] font-medium"
    >
      <span className="grid size-6 place-items-center rounded-full bg-pos text-white [&_svg]:size-3.5">
        <Check strokeWidth={3} />
      </span>
      {children}
    </div>
  );
}
