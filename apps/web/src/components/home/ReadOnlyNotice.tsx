"use client";
import { useNearWallet } from "near-connect-hooks";

function notice(owner: string | null, accountId: string | null): string {
  if (accountId) return `Read only: this vault belongs to ${owner ?? "another account"}.`;
  const ownerLine = owner ? ` Owner: ${owner}.` : "";
  return `Read only.${ownerLine} Connect a wallet to run your own vault.`;
}

/** Shown when the visitor is not the vault owner: everything reads, nothing signs. */
export function ReadOnlyNotice({
  owner,
  accountId,
}: {
  owner: string | null;
  accountId: string | null;
}) {
  const { connector } = useNearWallet();
  return (
    <div className="mb-5 flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3 text-[13px]">
      <span className="min-w-0 flex-1 text-muted">{notice(owner, accountId)}</span>
      {accountId ? null : (
        <button
          type="button"
          onClick={() => void connector.connect().catch(() => undefined)}
          className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
        >
          Connect
        </button>
      )}
    </div>
  );
}
