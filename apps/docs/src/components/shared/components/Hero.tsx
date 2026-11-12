"use client";

import clsx from "clsx";
import Image from "next/image";

import { useCurrentBreakpoint } from "~/hooks/useCurrentBreakpoint";
import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import { basePath } from "~/lib/app.constants";
import { isMainRoute, pageAt } from "~/lib/site";

/** Width of the section illustrations. */
const HERO_IMG_WIDTH = 464;

/** Title, description and illustration at the top of a page, from `src/site.json`. */
export const Hero: React.FC = () => {
  const { upLg } = useCurrentBreakpoint();
  const route = useNormalizedRoute();
  const page = pageAt(route);
  const isMainPage = isMainRoute(route);

  if (!page || route === "/") return null;

  const { title, description, heroImgUrl } = page;

  return (
    <div
      className={clsx("grid grid-cols-10 gap-8 mb-20 sm:mb-[120px]", {
        "lg:min-h-[520px]": isMainPage,
        "md:mb-[152px]": !isMainPage,
      })}
    >
      <div
        className={clsx("order-2 lg:order-1 flex flex-col justify-center gap-8 sm:gap-10", {
          "col-span-10 lg:col-span-5 xl:col-span-4": isMainPage,
          "col-span-10 lg:col-span-6": !isMainPage,
        })}
      >
        <h1 className="text-4xl sm:text-5xl md:text-[80px] md:leading-none md:-tracking-[2.4px] font-medium text-grey-900 dark:text-grey-50">
          {title}
        </h1>

        {description && (
          <div className="text-base leading-[160%] font-normal text-grey-400 dark:text-grey-300">
            {description}
          </div>
        )}
      </div>

      {heroImgUrl && (
        <div
          className={clsx("order-1 lg:order-2 flex lg:justify-center", {
            "col-span-10 lg:col-span-5 xl:col-span-6": isMainPage,
            "col-span-10 lg:col-span-4": !isMainPage,
          })}
        >
          <Image
            src={`${basePath}${heroImgUrl}`}
            alt=""
            width={HERO_IMG_WIDTH}
            height={520}
            className="w-auto lg:w-full max-h-[100px] sm:max-h-[150px] lg:max-h-[unset] !rounded-none !mt-0"
            priority
            style={upLg ? { maxWidth: `${HERO_IMG_WIDTH}px` } : undefined}
          />
        </div>
      )}
    </div>
  );
};
