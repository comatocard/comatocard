import type { Verification } from "@comatocard/agents/private-chat";

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-2.5 py-2.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-ink text-white" : "bg-[#f8e9e7] text-neg"}`}
      >
        {ok ? "✓" : "!"}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">
          {label}
          <span className="sr-only">{ok ? ", passed" : ", failed"}</span>
        </span>
        <span className="block text-[12px] text-muted">{detail}</span>
      </span>
    </li>
  );
}

/**
 * "Verified in TEE": every check the server ran on the assistant's answer, passed or not. What is
 * not checked is said too, so the badge never claims more than it proves.
 */
export function TeePanel({ verification: v }: { verification: Verification }) {
  const quote = v.quote;
  return (
    <div className="rounded-[16px] border border-line bg-white px-4 pt-3 pb-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold">
          {v.verified ? "Verified in TEE" : "Not verified"}
        </span>
        <span className="text-[12px] text-muted">{v.model}</span>
      </div>
      <ul className="mt-1 divide-y divide-line">
        <Check
          ok={v.responseHashesMatch && v.responseSigned}
          label="The answer is signed by the TEE"
          detail="ed25519 over the model and the hashes of the exact request and answer"
        />
        <Check
          ok={quote?.quoteSigned === true && quote.qeReportSigned && quote.attestationKeyBound}
          label="Intel TDX quote is valid"
          detail="Quote, quoting enclave report and attestation key all check out"
        />
        <Check
          ok={quote?.chainToIntelRoot === true}
          label="Signed by Intel"
          detail="The certificate chain ends at the pinned Intel SGX root"
        />
        <Check
          ok={v.quoteBindsKeyAndNonce}
          label="Fresh, and bound to this key"
          detail="The quote carries the signing key and the nonce sent for this answer"
        />
        <Check
          ok={v.composeMeasured}
          label="The app inside is measured"
          detail={
            v.composeHash
              ? `Compose hash ${v.composeHash.slice(0, 12)}…`
              : "No compose hash reported"
          }
        />
      </ul>
      <p className="py-2.5 text-[11.5px] text-muted">
        Signer {v.signingAddress.slice(0, 10)}…. Not checked: TCB level and revocation, GPU
        evidence, an allowlist of measurements.
      </p>
    </div>
  );
}
