"use client";

import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import { pageAt, sections } from "~/lib/site";

import { NavigationSection } from "./NavigationSection";

/** Cards linking to every page of the current section, except its overview. */
export const CurrentPageNavigationSections: React.FC = () => {
  const sectionRoute = pageAt(useNormalizedRoute())?.section;
  const pages = sections.find((s) => s.route === sectionRoute)?.pages ?? [];

  if (!pages.length) return null;

  return (
    <div className="flex flex-col gap-20 sm:gap-[120px] w-full">
      <NavigationSection
        navItems={pages.map((page) => ({
          title: page.title,
          description: page.description,
          href: page.route,
        }))}
      />
    </div>
  );
};
