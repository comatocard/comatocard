import { CurvedDivider } from "./CurvedDivider";
import { SECTION } from "./links";

/** The middle card is shorter: with the row aligned to the bottom, that staggers the tops. */
const STEPS = [
  {
    height: "min-h-[450px]",
    video: "/landing/insight-1.mp4",
    overlay: "bg-[rgba(206,223,235,0.25)]",
    title: "Create",
    body: "Your card account, with a wallet",
  },
  {
    height: "min-h-[350px]",
    video: "/landing/insight-2.mp4",
    overlay: "bg-[rgba(247,236,233,0.6)]",
    title: "Fund",
    body: "Test tUSD from the faucet",
  },
  {
    height: "min-h-[450px]",
    video: "/landing/insight-3.mp4",
    overlay: "bg-[rgba(218,218,218,0.2)]",
    title: "Issue",
    body: "A card for every agent, with its limits",
  },
] as const;

/** Setup in three steps, each on a soft looping video card. */
export function Steps() {
  return (
    <div id={SECTION.steps} className="scroll-mt-24 rounded-t-[32px] bg-white md:rounded-t-[56px]">
      <div className="flex flex-col gap-[90px] px-6 py-20 md:px-12 lg:px-[60px]">
        <div className="flex max-w-[517px] flex-col gap-10">
          <h2
            data-scroll
            className="text-4xl leading-none font-medium tracking-[-0.03em] text-[#00041F] md:text-5xl lg:text-6xl lg:leading-[60px]"
          >
            Set it up once
          </h2>
          <p data-scroll className="max-w-[361px] text-base text-[#49484F] md:text-lg lg:text-xl">
            Three steps.
          </p>
        </div>
        <ol className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-end">
          {STEPS.map((step) => (
            <li
              key={step.title}
              data-scroll
              className={`relative flex flex-1 flex-col justify-end overflow-hidden rounded-[40px] p-10 ${step.height}`}
            >
              <video
                ref={(el) => {
                  if (el) el.muted = true;
                }}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                tabIndex={-1}
              >
                <source src={step.video} type="video/mp4" />
              </video>
              <div className={`absolute inset-0 ${step.overlay}`} />
              <div className="relative z-10 flex flex-col gap-5">
                <h3 className="text-5xl leading-none font-medium text-[#00041F] md:text-[60px] md:leading-[60px]">
                  {step.title}
                </h3>
                <p className="text-lg text-[#49484F] opacity-80 md:text-[22px]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <CurvedDivider fill="#F4F0ED" />
    </div>
  );
}
