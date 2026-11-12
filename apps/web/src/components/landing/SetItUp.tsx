const STEPS = [
  {
    title: "Create",
    body: "Your card account, with a wallet",
    tone: "bg-[radial-gradient(120%_90%_at_20%_10%,#d9dcff_0%,#e9d7f3_45%,#f4c9df_100%)]",
  },
  {
    title: "Fund",
    body: "Test tUSD from the faucet",
    tone: "bg-[radial-gradient(120%_90%_at_80%_0%,#ffd9e2_0%,#f3c7dc_45%,#e2d4f6_100%)]",
  },
  {
    title: "Issue",
    body: "A card for every agent",
    tone: "bg-[radial-gradient(120%_90%_at_50%_100%,#e6e6ee_0%,#d9d2f2_45%,#f2c6df_100%)]",
  },
] as const;

/** The three setup steps, as the app walks through them. */
export function SetItUp() {
  return (
    <section id="how" className="bg-white px-5 py-24 lg:py-32">
      <div className="mx-auto max-w-[1180px]">
        <h2 data-scroll className="text-[36px] font-semibold tracking-[-.03em] lg:text-[48px]">
          Set it up once
        </h2>
        <p data-scroll className="mt-2 text-[15px] text-muted">
          Three steps.
        </p>
        <ol className="mt-10 grid gap-4 md:grid-cols-3 md:items-end">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              data-scroll
              className={`flex flex-col justify-end rounded-[28px] p-7 ${step.tone} ${i === 1 ? "md:aspect-[4/4.2]" : "md:aspect-[4/4.8]"} aspect-[4/3]`}
            >
              <span className="text-[13px] font-semibold text-ink/50">0{i + 1}</span>
              <h3 className="mt-1 text-[40px] font-semibold tracking-[-.03em] lg:text-[52px]">
                {step.title}
              </h3>
              <p className="mt-1 text-[14px] text-ink/60">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
