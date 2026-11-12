import { SHIP_FASTER_CARD_LINKS } from "../Home.constants";
import { NarrowCardLink } from "./NarrowCardLink";

export const ShipFaster = () => {
  return (
    <div className="py-16 md:py-20 max-w-[1312px] mx-auto">
      <div className="flex flex-col lg:flex-row gap-8 px-5 md:px-[72px]">
        <div className="basis-full lg:basis-[448px]">
          <h2 className="text-[32px] md:text-[36px] leading-[110%] tracking-[-0.64px] md:tracking-[-0.72px] font-medium text-grey-900 dark:text-grey-50 mb-6 text-center lg:text-left">
            Go deeper
          </h2>

          <div className="flex flex-col items-center lg:items-start mb-10">
            <div className="w-8 h-[3px] rounded-full bg-brand-primary mx-auto lg:mx-0" />
          </div>

          <p className="text-[16px] leading-[160%] font-normal text-grey-400 dark:text-grey-300 text-center lg:text-left max-w-[448px] mx-auto lg:mx-0">
            Agents that pay within their limits, the indexer behind the books, the vault contract
            and how it is secured.
          </p>
        </div>

        <div className="basis-full lg:basis-auto lg:flex-grow md:items-center md:flex md:justify-center lg:min-w-[536px]">
          <div className="flex flex-col flex-wrap md:inline-grid md:grid-cols-2 gap-6 md:justify-center md:items-center">
            {SHIP_FASTER_CARD_LINKS.map((link) => (
              <NarrowCardLink key={link.href} {...link} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
