import Image from "next/image";
import { InfoTip } from "../ui";
import { LoopVideo } from "./LoopVideo";

/** The treasury: cards keep spending because the account refills through NEAR Intents. */
export function ToppedUp() {
  return (
    <section className="bg-[#f7f7f5] px-5 py-24 lg:py-36">
      <div className="mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-2">
        <div>
          <h2
            data-scroll
            className="text-[36px] font-semibold leading-[1.05] tracking-[-.03em] lg:text-[56px]"
          >
            Topped up before it runs dry.
          </h2>
          <p data-scroll className="mt-4 flex items-center gap-1.5 text-[16px] text-muted">
            Refilled through NEAR Intents.
            <InfoTip label="Top-ups">
              When the cards may spend more than the account holds, the treasury plans a swap with a
              1Click quote. It is a dry run by default; nothing moves until you sign.
            </InfoTip>
          </p>
          <p
            data-scroll
            className="mt-6 inline-flex items-center gap-3 rounded-full bg-[#111316] py-2 pr-4 pl-3 text-[12px] text-white/70"
          >
            <Image
              src="/landing/near-intents.png"
              alt="NEAR Intents"
              width={240}
              height={40}
              className="h-4 w-auto"
            />
            1Click quote · dry run by default
          </p>
        </div>
        <div data-scroll className="flex justify-center lg:justify-end">
          <Image
            src="/landing/topup-wallet.png"
            alt=""
            width={720}
            height={1152}
            sizes="(min-width: 1024px) 320px, 60vw"
            className="h-auto w-[60%] max-w-[320px] drop-shadow-[0_40px_50px_rgba(0,0,0,.18)]"
          />
        </div>
      </div>
    </section>
  );
}

/** HTTP 402: the merchant asks, the card pays, the resource unlocks. */
export function AskPay() {
  return (
    <section id="merchants" className="overflow-hidden bg-white px-5 py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2
            data-scroll
            className="text-[64px] font-semibold leading-[0.95] tracking-[-.04em] lg:text-[112px]"
          >
            Ask.
            <br />
            Pay.
          </h2>
          <p data-scroll className="mt-5 text-[16px] text-muted">
            Your agent asks. The card pays. The API unlocks.
          </p>
          <pre
            data-scroll
            className="mt-7 rounded-[16px] bg-[#0b0c0d] p-5 font-mono text-[11.5px] leading-[1.8] break-all whitespace-pre-wrap text-white/75 sm:text-[12px] sm:break-normal"
          >
            <span className="text-[#4ade80]">GET</span> /api/shop/report{"\n"}
            <span className="text-[#fbbf24]">402</span>
            {' { amount: "1000000", reference: "shop-8f2c…" }\n'}
            pay(merchant, amount, reference) <span className="text-white/40">→ settled</span>
            {"\n"}
            <span className="text-[#4ade80]">200</span>
            {" { gas_price, block_height, receipt }"}
          </pre>
        </div>
        <div data-scroll className="relative">
          <Image
            src="/landing/buy-anything.png"
            alt=""
            width={1000}
            height={701}
            sizes="(min-width: 1024px) 600px, 100vw"
            className="h-auto w-full"
          />
          <span className="absolute top-[14%] left-[30%] rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold shadow-[0_10px_24px_-10px_rgba(0,0,0,.3)]">
            <span className="mr-1.5 rounded bg-[#fbbf24] px-1 text-[10px]">402</span>
            Payment required · 1 tUSD
          </span>
          <span className="absolute bottom-[22%] left-[12%] rounded-full bg-[#111316] px-3 py-1.5 text-[12px] font-semibold text-white">
            Settled on NEAR
          </span>
        </div>
      </div>
    </section>
  );
}

/** Agents never sleep, and the limits hold at any hour. */
export function AroundTheClock() {
  return (
    <section className="relative overflow-hidden bg-white">
      <LoopVideo
        src="/landing/flags.mp4"
        poster="/landing/flags-poster.jpg"
        className="h-[78svh] min-h-[520px] w-full object-cover"
      />
      <div className="absolute inset-0 grid place-items-center px-5 text-center">
        <div>
          <h2
            data-scroll
            className="text-[34px] font-semibold leading-[1.05] tracking-[-.03em] [text-shadow:0_2px_30px_rgba(255,255,255,.9)] lg:text-[60px]"
          >
            Agents work around the clock.
            <br />
            So do their cards.
          </h2>
          <p data-scroll className="mt-4 text-[15px] text-ink/70">
            Any hour. Within your limits.
          </p>
        </div>
      </div>
    </section>
  );
}
