"use client";

import clsx from "clsx";

import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import { isMainRoute } from "~/lib/site";

import { SectionTitle, type SectionTitleProps } from "../../SectionTitle";
import { NavigationCardLink, type NavigationCardLinkProps } from "./NavigationCardLink";

type NavigationSectionProps = Omit<SectionTitleProps, "title"> & {
  title?: string;
  navItems: NavigationCardLinkProps[];
};

export const NavigationSection: React.FC<NavigationSectionProps> = ({
  title,
  description,
  colorClass,
  link,
  navItems,
}) => {
  const isMainPage = isMainRoute(useNormalizedRoute());

  return (
    <section className="flex flex-col gap-10 w-full">
      {title && (
        <SectionTitle title={title} description={description} colorClass={colorClass} link={link} />
      )}

      <div
        className={clsx("grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-8 w-full", {
          "sm:grid-cols-1 lg:grid-cols-3": navItems.length === 1,
          "lg:grid-cols-3": navItems.length % 3 === 0,
          "lg:grid-cols-4": navItems.length % 4 === 0,
          "lg:grid-cols-3 xl:grid-cols-5":
            navItems.length >= 5 && navItems.length % 3 !== 0 && navItems.length % 4 !== 0,
        })}
      >
        {navItems.map((article, index) => (
          <NavigationCardLink
            key={article.href}
            {...article}
            isMainPage={isMainPage}
            itemIndex={index}
          />
        ))}
      </div>
    </section>
  );
};
