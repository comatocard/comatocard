"use client";

import Image from "next/image";
import Link from "next/link";
import type { PropsWithChildren } from "react";

import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import { usePreviousRoute } from "~/hooks/usePreviousRoute";
import { basePath } from "~/lib/app.constants";
import { home, isMainRoute, nextPage, pageAt } from "~/lib/site";

import { IconArrowNarrowRight, IconSpeechBubble } from "../../Icons";
import { NavigationSection } from "../../NavigationSection";

const segments = (route: string) => route.split("/").filter(Boolean).length;

/**
 * Back link to the page the reader came from (or the home page) above the content, and the next
 * page in reading order with a feedback box below it.
 */
export const PrevNextNavigationWrapper: React.FC<PropsWithChildren> = ({ children }) => {
  const route = useNormalizedRoute();
  const previousRoute = usePreviousRoute(route);
  const page = pageAt(route);
  const next = page && nextPage(page);

  // A previous page counts unless it is deeper than this one or the page that comes next.
  const visited = previousRoute ? pageAt(previousRoute) : undefined;
  const back =
    visited && segments(visited.route) <= segments(route) && visited.route !== next?.route
      ? visited
      : home;

  if (!page || isMainRoute(route)) return <>{children}</>;

  return (
    <>
      <div className="mb-8 sm:mb-10 md:mb-20 leading-[0]">
        <Link
          href={back.route}
          className="inline-flex items-center gap-2 text-lg leading-[130%] text-grey-400 dark:text-grey-300 hover:!text-green-100 dark:hover:!text-green-100 transition-all"
        >
          <IconArrowNarrowRight className="text-current" />
          {back.title}
        </Link>
      </div>

      {children}

      {next && (
        <>
          <div className="mb-16 mt-20 sm:mt-[120px]">
            <NavigationSection
              title="Continue Learning"
              description="Continue with the next part or try a related tutorial"
              navItems={[
                {
                  topTitle: "Next",
                  title: next.title,
                  description: next.description,
                  href: next.route,
                },
              ]}
            />
          </div>
          <div className="pt-4">
            <div className="border dark:border-grey-600 rounded-lg flex w-full flex-col md:flex-row gap-8 lg:gap-16 items-center py-10 px-6 md:py-6 md:px-10">
              <div className="mt-0">
                <Image
                  src={`${basePath}/img/pages/feedback.svg`}
                  alt="Feedback"
                  width={250}
                  height={152}
                  className="w-[240px] !mt-0"
                />
              </div>
              <div className="grow flex lg:items-center items-start gap-8 flex-col lg:flex-row">
                <div className="grow">
                  <div className="text-2xl dark:text-grey-50 text-grey-900 font-medium mb-2">
                    How has your developer experience been?
                  </div>
                  <div className="dark:text-grey-300 text-grey-400">
                    Share your feedback and help improve it for everyone.
                  </div>
                </div>
                <div>
                  <Link
                    target="_blank"
                    rel="noreferrer noopener"
                    href="https://github.com/comatocard/comatocard/issues"
                    className="flex gap-1"
                  >
                    <IconSpeechBubble className="dark:text-grey-300 text-grey-400" />
                    <div className="text-[#00A5C6] hover:text-[#00A5C6]/80 dark:hover:text-lime-700/80 dark:text-lime-700 font-medium">
                      Share your thoughts&nbsp;→
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
