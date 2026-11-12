"use client";

import clsx from "clsx";
import type { PropsWithChildren } from "react";

import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import { isMainRoute } from "~/lib/site";

import { NavigationLayout } from "./NavigationLayout";
import { TopBar } from "./TopBar";

/** Page chrome: navigation drawer, top bar with search, and the padded main column. */
export const Layout: React.FC<PropsWithChildren> = ({ children }) => {
  const route = useNormalizedRoute();
  const isMainPage = isMainRoute(route);

  return (
    <div className="docs-layout">
      <NavigationLayout isMainPage={isMainPage}>
        <TopBar />
        {/* pb-8 and the mt-16 spacer keep the gap above the footer that Nextra's article had. */}
        <div className="pb-8">
          <main
            className={clsx("px-4 py-5 sm:py-8 sm:px-6 md:px-[72px]", {
              "md:pt-24": isMainPage,
              "md:pt-[120px]": !isMainPage,
              "!px-0": route === "/",
            })}
          >
            {children}
            <div className="mt-16" />
          </main>
        </div>
      </NavigationLayout>
    </div>
  );
};
