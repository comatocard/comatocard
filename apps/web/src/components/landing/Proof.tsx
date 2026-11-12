import { Check } from "lucide-react";
import { GUTTER, HEADLINE, INK, PAGE_BG } from "./links";

const CHECKS = [
  "A private assistant answers",
  "Its answer is checked first",
  "You sign every change",
] as const;

/** Changing a card's limits in plain words, and why the answer can be trusted. */
export function Proof() {
  return (
    <section className={`${GUTTER} ${PAGE_BG} py-24 lg:py-32`}>
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
        <div>
          <p data-scroll className="text-[11px] tracking-[0.2em] text-[#18161B]/45 uppercase">
            Just say it
          </p>
          <h2 data-scroll className={`mt-5 font-light ${INK}`} style={HEADLINE}>
            Change limits in plain words
          </h2>
          <p
            data-scroll
            className="mt-[30px] text-[15px] leading-relaxed text-[#18161B]/60 sm:text-base"
          >
            Tell it what you want. See the change before you sign.
          </p>
        </div>

        <figure
          data-scroll
          aria-label="Example of changing a card's limits"
          className="m-0 space-y-3 rounded-[28px] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,.25)]"
        >
          <p className="rounded-[18px] bg-[#18161B] px-5 py-3.5 text-[15px] font-light text-[#F4F0ED]">
            “Lower the daily limit to 40 and only let it pay the shop”
          </p>
          <dl className="space-y-2 text-[14px]">
            <div className="flex items-center justify-between rounded-[16px] bg-[#F4F0ED] px-4 py-3">
              <dt className="text-[#18161B]/50">Per day</dt>
              <dd>
                <span className="text-[#18161B]/35 line-through">50</span>
                <span className="ml-2 font-semibold">40</span>
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-[16px] bg-[#F4F0ED] px-4 py-3">
              <dt className="text-[#18161B]/50">Can pay</dt>
              <dd>
                <span className="text-[#18161B]/35 line-through">Anyone</span>
                <span className="ml-2 font-semibold">Only the shop</span>
              </dd>
            </div>
          </dl>
          <ul className="space-y-1.5 px-1 pt-2">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-center gap-2 text-[14px] text-[#18161B]/70">
                <Check className="size-4 text-pos" strokeWidth={3} />
                {c}
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </section>
  );
}
