"use client";
import { useCreateVault } from "../../hooks/setup";
import { FACTORY_ID } from "../../lib/config";
import { Field } from "../form/Field";
import { VaultPicker } from "../home/VaultPicker";
import { InfoTip } from "../ui";
import { SignButton, StepFooter, StepHead } from "./StepParts";

/** Step one: name and create the card account, or open one the wallet already owns. */
export function AccountStep({
  owner,
  name,
  onName,
  onDone,
}: {
  owner: string;
  name: string;
  onName: (name: string) => void;
  onDone: () => void;
}) {
  const { create, error, checking, state } = useCreateVault(owner);

  return (
    <>
      <StepHead
        kicker="Step 1 of 3"
        title="Open a card account"
        sub="Holds what your cards spend."
        tip="Its own NEAR account that only your wallet controls. Cards pay from it, never from your wallet."
      />
      <div className="mt-6 space-y-3">
        <div data-reveal>
          <Field
            label="Name"
            value={name}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="my-agents"
            onChange={(e) => onName(e.target.value.toLowerCase().trim())}
            error={error}
            hint={name ? `${name}.${FACTORY_ID}` : null}
          />
        </div>
        <div
          data-reveal
          className="flex items-center justify-between rounded-[16px] bg-card px-4 py-3.5 text-[14px]"
        >
          <span className="flex items-center gap-1.5 text-muted">
            One-time cost
            <InfoTip label="One-time cost">
              Pays the account&apos;s storage and the gas of every card payment. It stays in the
              card account.
            </InfoTip>
          </span>
          <span className="font-semibold tabular-nums">0.5 NEAR</span>
        </div>
      </div>
      <StepFooter
        state={state}
        secondary={
          <VaultPicker owner={owner} onCreate={() => undefined} label="I already have one" />
        }
      >
        <SignButton
          state={state}
          disabled={!name || checking}
          onClick={() => void create(name).then((ok) => ok && onDone())}
        >
          Create account
        </SignButton>
      </StepFooter>
    </>
  );
}
