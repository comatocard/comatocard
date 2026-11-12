"use client";

import clsx from "clsx";
import Link from "next/link";

import { useCurrentBreakpoint } from "~/hooks/useCurrentBreakpoint";
import { pageAt } from "~/lib/site";

import { DeterministicIconArticle, IconTime } from "../../Icons";

export type NavigationCardLinkProps = {
  href: string;
  title: string;
  topTitle?: string;
  description?: string;
  icon?: React.ReactNode;
  readTime?: string;
  readType?: string;
  className?: string;
  isMainPage?: boolean;
  itemIndex?: number;
};

export const NavigationCardLink: React.FC<NavigationCardLinkProps> = ({
  href,
  title,
  topTitle,
  description,
  icon,
  readTime,
  readType,
  className,
  isMainPage,
  itemIndex,
}) => {
  const { upSm } = useCurrentBreakpoint();
  const articleIndex = pageAt(href)?.index || itemIndex || 0;

  return (
    <Link
      href={href}
      className={clsx(
        `flex flex-col sm:h-[304px] gap-6 p-3 sm:p-6 justify-between rounded-lg border border-grey-200
         hover:shadow-light hover:border-white bg-white dark:bg-grey-900 transition-all`,
        {
          "dark:border-grey-600 dark:hover:bg-grey-800 dark:hover:border-grey-800": isMainPage,
          "dark:border-grey-900 dark:hover:bg-grey-600 dark:hover:border-grey-600": !isMainPage,
        },
        className,
      )}
    >
      <div className="flex-grow">{icon || <DeterministicIconArticle index={articleIndex} />}</div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {topTitle && (
            <p className="text-[10px] leading-none font-medium uppercase text-[#00A5C6] dark:text-[#00A5C6]">
              {topTitle}
            </p>
          )}

          <h3 className="text-xl font-medium text-black dark:text-white line-clamp-2">{title}</h3>

          {(upSm || description) && (
            <p className="text-sm text-grey-400 dark:text-grey-300 line-clamp-3 sm:h-[55px]">
              {description}
            </p>
          )}
        </div>

        {(upSm || readTime || readType) && (
          <div className="flex justify-between gap-2 flex-wrap sm:h-[24px] overflow-hidden">
            <p className="flex gap-1 items-center">
              {readTime && (
                <>
                  <IconTime /> <span className="text-black dark:text-white">{readTime}</span>
                </>
              )}
            </p>

            <p className="text-black dark:text-white">{readType}</p>
          </div>
        )}
      </div>
    </Link>
  );
};
