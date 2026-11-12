import clsx from "clsx";
import { useConfig } from "nextra-theme-docs";
import type { PropsWithChildren } from "react";

import { useIsHomePage } from "~/hooks/useIsHomePage";
import { useSetDirectoriesState } from "~/hooks/useSetDirectoriesState";

import { Hero } from "../../Hero";
import { IconGitHub } from "../../Icons";
import { TableOfContentsWrapper } from "../../TOC";
import { PrevNextNavigationWrapper } from "./PrevNextNavigationWrapper";

type MainContentWrapperProps = PropsWithChildren;

/**
 * @description Wrapper for nextra main rendered content. Can be used to add custom components to all rendered pages.
 */
export const MainContentWrapper: React.FC<MainContentWrapperProps> = ({ children }) => {
  useSetDirectoriesState();
  const { frontMatter } = useConfig();
  const editUrl = typeof frontMatter.editUrl === "string" ? frontMatter.editUrl : undefined;
  const isHomePage = useIsHomePage();

  return (
    <PrevNextNavigationWrapper>
      <Hero />
      <TableOfContentsWrapper>{children}</TableOfContentsWrapper>
      <div className={clsx("mt-16 mb-8", (isHomePage || !editUrl) && "hidden")}>
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 group"
          style={{ textDecoration: "none" }}
        >
          <span className="w-9 h-9 flex items-center justify-center rounded-full border border-[#00bc8d] bg-transparent group-hover:bg-[#00bc8d]/10 transition-colors">
            <IconGitHub className="w-5 h-5 text-[#00bc8d]" />
          </span>
          <span className="text-lg font-medium" style={{ color: "#00bc8d" }}>
            Improve this documentation via GitHub
          </span>
        </a>
      </div>
    </PrevNextNavigationWrapper>
  );
};
