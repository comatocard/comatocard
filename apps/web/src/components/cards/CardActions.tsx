"use client";
import { KeyRound, SlidersHorizontal, Snowflake, Sparkles, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { ActionState } from "../../hooks/useOwnerAction";
import { ActionStatus } from "../form/ActionStatus";

export type CardSheet = "policy" | "rotate" | "revoke" | "assistant";

function RoundAction({
  icon,
  label,
  onClick,
  primary = false,
  busy = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="group flex w-[72px] flex-col items-center gap-1.5 text-[12.5px] font-medium disabled:opacity-50"
    >
      <span
        className={`grid size-[52px] place-items-center rounded-full transition-transform duration-150 group-active:scale-[.94] [&_svg]:size-5 ${
          primary
            ? "text-white [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),0_10px_22px_-10px_rgba(0,0,0,.42)]"
            : "border border-line bg-white text-ink [box-shadow:0_8px_18px_-12px_rgba(0,0,0,.2)]"
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * The owner's controls as round buttons under the card; anyone else can still ask the assistant.
 * Revoking sits apart, as a quiet link, because it cannot be undone.
 */
export function CardActions({
  isOwner,
  frozen,
  onToggleFreeze,
  onOpen,
  state,
  onDirect,
}: {
  isOwner: boolean;
  frozen: boolean;
  onToggleFreeze: () => void;
  onOpen: (sheet: CardSheet) => void;
  state: ActionState;
  onDirect: () => void;
}) {
  const busy = state.status === "signing" || state.status === "confirming";
  return (
    <div>
      <div className="flex justify-center gap-2">
        {isOwner ? (
          <>
            <RoundAction
              primary
              busy={busy}
              icon={frozen ? <Sun /> : <Snowflake />}
              label={frozen ? "Unfreeze" : "Freeze"}
              onClick={onToggleFreeze}
            />
            <RoundAction
              icon={<SlidersHorizontal />}
              label="Limits"
              onClick={() => onOpen("policy")}
            />
          </>
        ) : null}
        <RoundAction icon={<Sparkles />} label="Assistant" onClick={() => onOpen("assistant")} />
        {isOwner ? (
          <RoundAction icon={<KeyRound />} label="New key" onClick={() => onOpen("rotate")} />
        ) : null}
      </div>
      {isOwner ? <ActionStatus state={state} onDirect={onDirect} /> : null}
    </div>
  );
}
