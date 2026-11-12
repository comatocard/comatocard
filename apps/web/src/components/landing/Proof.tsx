import { Check } from "lucide-react";
import { InfoTip } from "../ui";

const FACTS = [
  {
    value: "0.4.0",
    label: "Reviewed vault contract",
    tip: "Independently reviewed on 11 Nov 2026; every high and medium issue is fixed with a regression test.",
  },
  {
    value: "v0.4.1",
    label: "Reproducible release on testnet",
    tip: "Built with cargo near build reproducible-wasm; the deployed code hash matches the release.",
  },
  {
    value: "Gasless",
    label: "Owner actions through the relayer",
    tip: "You sign a delegate action; the relayer wraps it and pays the gas.",
  },
] as const;

const CHECKS = [
  "Answer signed by the TEE",
  "Intel TDX quote, signed by Intel",
  "Fresh nonce, bound to the signing key",
  "App inside is measured",
] as const;

/** The policy assistant, and why its answers can be trusted before you sign them. */
export function Proof() {
  return (
    <section className="bg-[#0b0c0d] px-5 py-24 text-white lg:py-32">
      <div className="mx-auto grid max-w-[1180px] items-center gap-14 lg:grid-cols-2">
        <div>
          <p
            data-scroll
            className="text-[12px] font-semibold tracking-[.18em] text-[#4ade80] uppercase"
          >
            Proof, not promises
          </p>
          <h2
            data-scroll
            className="mt-4 text-[36px] font-semibold leading-[1.05] tracking-[-.03em] lg:text-[52px]"
          >
            Change limits in plain words.
          </h2>
          <p data-scroll className="mt-4 text-[16px] text-white/60">
            Every answer is verified in a TEE before you sign.
          </p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            {FACTS.map((f) => (
              <li key={f.label} data-scroll>
                <p className="text-[28px] font-semibold tracking-[-.02em]">{f.value}</p>
                <p className="mt-1 flex items-start gap-1.5 text-[13px] text-white/55">
                  {f.label}
                  <InfoTip label={f.label}>{f.tip}</InfoTip>
                </p>
              </li>
            ))}
          </ul>
        </div>

        <figure
          data-scroll
          className="m-0 space-y-3 rounded-[24px] border border-white/10 bg-white/[.04] p-5"
          aria-label="Example: changing limits with the assistant"
        >
          <p className="rounded-[16px] bg-white/[.06] px-4 py-3 text-[14px] text-white/85">
            “Lower the daily limit to 40 and only allow comatocard-shop.testnet”
          </p>
          <dl className="space-y-2 text-[13px]">
            <div className="flex items-center justify-between rounded-[14px] bg-white/[.04] px-4 py-3">
              <dt className="text-white/50">Per day</dt>
              <dd>
                <span className="text-white/40 line-through">50 tUSD</span>
                <span className="ml-2 font-semibold">40 tUSD</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[14px] bg-white/[.04] px-4 py-3">
              <dt className="text-white/50">Merchants</dt>
              <dd className="text-right">
                <span className="text-white/40 line-through">Any merchant</span>
                <span className="ml-2 font-semibold">Only comatocard-shop.testnet</span>
              </dd>
            </div>
          </dl>
          <div className="rounded-[16px] border border-[#4ade80]/25 bg-[#4ade80]/[.07] p-4">
            <p className="text-[13px] font-semibold text-[#4ade80]">Verified in TEE</p>
            <ul className="mt-2 space-y-1.5">
              {CHECKS.map((c) => (
                <li key={c} className="flex items-center gap-2 text-[13px] text-white/75">
                  <Check className="size-3.5 text-[#4ade80]" strokeWidth={3} />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </figure>
      </div>
    </section>
  );
}
