"use client";

import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { type PropsWithChildren, useCallback, useEffect, useState } from "react";

import { useCurrentBreakpoint } from "~/hooks/useCurrentBreakpoint";
import { reveal } from "~/lib/helpers/animations";
import { sections } from "~/lib/site";

import { Footer } from "../../Footer";
import { IconDocsLogo } from "../../Icons";
import { ThemeToggle } from "../../ThemeToggle";
import { closeDrawerWidth, LeftNavDrawer, navMainItems } from "../Layout.constants";
import { Header } from "./Header";
import { NavigationAccordionLink } from "./NavigationAccordionLink";
import { NavigationItem } from "./NavigationItem";

type NavigationLayoutProps = PropsWithChildren<{
  isMainPage: boolean;
}>;

export const NavigationLayout: React.FC<NavigationLayoutProps> = ({ isMainPage, children }) => {
  const { upSm } = useCurrentBreakpoint();

  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(true);

  const closeMobileDrawer = useCallback(() => !upSm && setIsLeftDrawerOpen(false), [upSm]);

  // Sidebar pages of a section; overview pages stay reachable through the section link.
  const sectionPages = (route: string) => sections.find((s) => s.route === route)?.pages ?? [];

  // To prevent a flash of the drawer on first render given that useCurrentBreakpoint has an issue always returning false for the first render for upLg and others
  useEffect(() => {
    if (upSm) setIsLeftDrawerOpen(true);
    else setIsLeftDrawerOpen(false);
  }, [upSm]);

  return (
    <>
      <motion.div
        className={clsx("fixed z-[99] top-0 left-0 h-full", {
          "w-screen sm:w-[200px]": isLeftDrawerOpen,
        })}
        {...reveal}
      >
        <LeftNavDrawer
          variant="permanent"
          open={isLeftDrawerOpen}
          closeDrawerWidth={upSm ? closeDrawerWidth : 0}
          className={clsx("sm:h-full sm:flex sm:flex-col sm:overflow-hidden", {
            "sm:w-[200px] sm:border-r sm:border-grey-200 dark:sm:border-grey-700": isMainPage,
            "sm:w-[200px] sm:border-r-0": !isMainPage,
          })}
          classes={{
            paper: clsx(
              "shadow-none rounded-none bg-grey-50 dark:bg-grey-900 !border-r-0 sm:!border-r !border-grey-200 dark:!border-grey-700 [scrollbar-width:none;]",
              isLeftDrawerOpen && "!w-screen sm:!w-[200px]",
              isLeftDrawerOpen && !isMainPage && "sm:!border-r-0",
            ),
          }}
        >
          <div className="hidden sm:flex items-center h-[104px] py-6 pl-4 sm:pl-6 shrink-0">
            <Link href="/">
              <IconDocsLogo className="text-green-700 dark:text-grey-50" />
            </Link>
          </div>

          <div className="flex flex-col gap-6 flex-grow">
            <div className="flex-grow flex flex-col pt-24 sm:pt-0 pb-6 sm:pb-11">
              {navMainItems.map((items, index) => (
                <div key={items[0].url} className="flex flex-col">
                  <List className="w-full font-medium">
                    {items.map((item) => {
                      const navSectionPages = item.url ? sectionPages(item.url) : [];

                      return (
                        <div key={item.url}>
                          <NavigationItem
                            item={item}
                            isOpen={isLeftDrawerOpen}
                            onClick={closeMobileDrawer}
                          />

                          {navSectionPages.length > 0 && (
                            <List className="w-full">
                              {navSectionPages.map((page) => (
                                <div key={page.route} className="px-3 pl-12 sm:pr-6 pb-3 sm:pb-2">
                                  <NavigationAccordionLink
                                    page={page}
                                    onClick={closeMobileDrawer}
                                  />
                                </div>
                              ))}
                            </List>
                          )}
                        </div>
                      );
                    })}
                  </List>

                  {index < navMainItems.length - 1 && (
                    <Divider className="border-grey-200 dark:border-grey-600 w-6 my-3 self-center" />
                  )}
                </div>
              ))}
            </div>

            <div className="sm:hidden pb-6 pl-2 text-grey-400 dark:text-grey-300">
              <ThemeToggle />
            </div>
          </div>
        </LeftNavDrawer>
      </motion.div>

      <div
        className={clsx("relative min-h-screen flex flex-col", {
          "sm:pl-[200px] bg-grey-50 dark:bg-grey-900": isMainPage,
          "sm:w-[calc(100%-200px)] sm:!translate-x-[200px] sm:rounded-l-2xl bg-grey-50 dark:bg-grey-800 sm:z-[100] sm:shadow-[0_0_30px_0_rgba(31,32,33,0.15)]":
            !isMainPage,
        })}
      >
        <Header
          isLeftDrawerOpen={isLeftDrawerOpen}
          toggleDrawerOpen={() => setIsLeftDrawerOpen((prev) => !prev)}
          setIsLeftDrawerOpen={setIsLeftDrawerOpen}
        />

        <motion.div
          {...reveal}
          className="relative flex-grow text-black dark:text-white pt-[62px] sm:pt-0"
        >
          {children}
        </motion.div>

        <Footer />
      </div>
    </>
  );
};
