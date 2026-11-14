"use client";
import { KeyRound, SlidersHorizontal, Snowflake, Sparkles, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { ActionState } from "../../hooks/useOwnerAction";
import { pressHandlers } from "../../lib/motion/useShowHide";
import { ActionStatus } from "../form/ActionStatus";

export type CardSheet = "policy" | "rotate" | "revoke" | "assistant";

function PillAction({
  icon,
  label,
  onClick,
  primary = false,
  busy = false,
  iconOnly = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  busy?: boolean;
  /** A square button with the label read out, for the action used least. */
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      {...pressHandlers(0.97)}
      className={`flex h-12 items-center justify-center gap-2 rounded-full text-[14px] font-semibold disabled:opacity-50 [&_svg]:size-[17px] ${
        // A phone has room for three words and a key, not for three icons as well.
        iconOnly ? "w-12 shrink-0" : "min-w-0 flex-1 px-2 max-sm:[&_svg]:hidden"
      } ${
        primary
          ? "text-white [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),0_10px_22px_-10px_rgba(0,0,0,.42)]"
          : "border border-line bg-white text-ink"
      }`}
    >
      {icon}
      {iconOnly ? null : <span className="truncate">{label}</span>}
    </button>
  );
}

/**
 * The owner's controls as a row of pills under the card, Freeze first because it is the one
 * needed in a hurry; anyone else can still ask the assistant. Revoking sits apart, in its own row
 * with a warning, because it cannot be undone.
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
      <div className="flex gap-2">
        {isOwner ? (
          <>
            <PillAction
              primary
              busy={busy}
              icon={frozen ? <Sun /> : <Snowflake />}
              label={frozen ? "Unfreeze" : "Freeze"}
              onClick={onToggleFreeze}
            />
            <PillAction
              icon={<SlidersHorizontal />}
              label="Limits"
              onClick={() => onOpen("policy")}
            />
          </>
        ) : null}
        <PillAction icon={<Sparkles />} label="Assistant" onClick={() => onOpen("assistant")} />
        {isOwner ? (
          <PillAction
            iconOnly
            icon={<KeyRound />}
            label="New key"
            onClick={() => onOpen("rotate")}
          />
        ) : null}
      </div>
      {isOwner ? <ActionStatus state={state} onDirect={onDirect} /> : null}
    </div>
  );
}
