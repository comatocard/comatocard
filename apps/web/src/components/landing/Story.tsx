import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LoopVideo } from "./LoopVideo";
import { LINKS } from "./links";

/** One account, many cards: the card coming alive on video. */
export function Story() {
  return (
    <section
      id="story"
      className="overflow-hidden bg-[#f7f7f5] px-5 pt-24 pb-20 text-center lg:pt-32"
    >
      <p data-scroll className="text-[12px] font-semibold tracking-[.18em] text-pos uppercase">
        One account, many cards
      </p>
      <h2
        data-scroll
        className="mx-auto mt-4 max-w-[760px] text-[36px] font-semibold leading-[1.05] tracking-[-.03em] lg:text-[56px]"
      >
        Fund it once. Let every agent spend its share.
      </h2>
      <div data-scroll className="mx-auto mt-6 max-w-[960px]">
        <LoopVideo
          src="/landing/story.mp4"
          poster="/landing/story-poster.jpg"
          className="aspect-video w-full object-cover mix-blend-multiply"
        />
      </div>
      <Link
        data-scroll
        href={LINKS.app}
        className="mx-auto mt-4 inline-flex items-center gap-3 rounded-full border border-line bg-white py-2 pr-2 pl-5 text-[14px] font-semibold shadow-[0_8px_20px_-12px_rgba(0,0,0,.25)] transition-transform duration-150 active:scale-[.97]"
      >
        One card per agent
        <span className="grid size-8 place-items-center rounded-full bg-ink text-white">
          <ArrowRight className="size-4" />
        </span>
      </Link>
    </section>
  );
}
