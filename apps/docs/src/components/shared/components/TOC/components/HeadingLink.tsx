"use client";

import clsx from "clsx";
import type { PropsWithChildren } from "react";

import { useCurrentBreakpoint } from "~/hooks/useCurrentBreakpoint";

import { IconLink } from "../../Icons";
import { handleHeadingLinkClick } from "../TOC.helpers";

type HeadingLinkProps = PropsWithChildren<{
  tag: "h2" | "h3" | "h4" | "h5" | "h6";
  /** Set by Nextra from the heading text. */
  id?: string;
}>;

export const HeadingLink: React.FC<HeadingLinkProps> = ({ tag: Tag, id, children }) => {
  const { isSmallDevice } = useCurrentBreakpoint();

  if (!children) return null;

  const headingId = id ?? String(children).toLowerCase().replace(/\s+/g, "-");

  return (
    <Tag
      id={headingId}
      className={clsx("heading-link first:mt-0", {
        "mt-20 sm:mt-[136px]": Tag === "h2",
        "mt-8": Tag !== "h2",
      })}
    >
      <a
        href={`#${headingId}`}
        className={clsx("group inline-block relative !text-black dark:!text-white", {
          "text-2xl tracking-[-0.48px] font-medium": Tag === "h2",
          "text-xl font-medium": Tag === "h3",
          "text-lg font-medium": Tag === "h4",
          "text-base leading-[160%] font-semibold": Tag === "h5" || Tag === "h6",
        })}
        onClick={(event) =>
          handleHeadingLinkClick({ event, id: headingId, isMobile: isSmallDevice })
        }
      >
        <span className="mr-1">{children}</span>

        <span className="inline-block align-bottom">
          <IconLink className="text-grey-300 dark:text-grey-400 group-hover:text-green-100 transition-all" />
        </span>
      </a>
    </Tag>
  );
};
