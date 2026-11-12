import { useRouter } from "next/router";
import { getPagesUnderRoute } from "nextra/context";

import {
  getPageDescription,
  getPageReadTime,
  getPageReadType,
  getPageTitle,
} from "~/lib/helpers/nextra";

import { NavigationSection } from "./NavigationSection";

type CurrentPageNavigationSectionsProps = {
  /** Title above the cards; defaults to none. */
  mainTitle?: string;
  mainDescription?: string;
};

/** Cards linking to every page of the current section, except its overview and index. */
export const CurrentPageNavigationSections: React.FC<CurrentPageNavigationSectionsProps> = ({
  mainTitle,
  mainDescription,
}) => {
  const { route } = useRouter();
  // /build/overview -> /build
  const sectionRoute = route.endsWith("/") ? route : route.substring(0, route.lastIndexOf("/"));
  const pages = getPagesUnderRoute(sectionRoute).filter(
    (page) => page.kind === "MdxPage" && page.name !== "index" && page.route !== route,
  );

  if (!pages.length) return null;

  return (
    <div className="flex flex-col gap-20 sm:gap-[120px] w-full">
      <NavigationSection
        title={mainTitle}
        description={mainDescription}
        navItems={pages.map((page) => ({
          title: getPageTitle(page),
          description: getPageDescription(page),
          href: page.route,
          readTime: getPageReadTime(page),
          readType: getPageReadType(page),
        }))}
      />
    </div>
  );
};
