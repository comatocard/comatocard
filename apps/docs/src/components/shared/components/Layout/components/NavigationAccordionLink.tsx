"use client";

import clsx from "clsx";
import Link from "next/link";

import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import type { SitePage } from "~/lib/site";

type NavigationAccordionLinkProps = {
  page: SitePage;
  onClick?: () => void;
};

/** A page link under a section in the navigation drawer. */
export const NavigationAccordionLink: React.FC<NavigationAccordionLinkProps> = ({
  page,
  onClick,
}) => {
  const isRouteSelected = useNormalizedRoute() === page.route;

  return (
    <Link
      href={page.route}
      className={clsx("flex py-3 sm:py-2 last:pb-0 group", {
        "text-green-100 dark:text-green-100 hover:!text-green-100 dark:hover:!text-green-100":
          isRouteSelected,
        "text-grey-400 dark:text-grey-300 hover:!text-green-100 dark:hover:!text-green-100":
          !isRouteSelected,
      })}
      onClick={onClick}
    >
      <div className="text-base leading-[130%] sm:text-xs sm:leading-[110%] whitespace-pre-wrap text-ellipsis overflow-hidden">
        {page.title}
      </div>
    </Link>
  );
};
