import type { PropsWithChildren } from "react";

import { pageAt } from "~/lib/site";

import { Hero } from "../../Hero";
import { IconGitHub } from "../../Icons";
import { TableOfContentsWrapper } from "../../TOC";
import { PrevNextNavigationWrapper } from "./PrevNextNavigationWrapper";

type MainContentWrapperProps = PropsWithChildren<{ route: string }>;

/** Hero, table of contents, edit link and next page around a rendered page. */
export const MainContentWrapper: React.FC<MainContentWrapperProps> = ({ route, children }) => {
  const editUrl = pageAt(route)?.editUrl;

  return (
    <PrevNextNavigationWrapper>
      {/* Pagefind indexes only this element, so search ignores the navigation. */}
      <div data-pagefind-body>
        <Hero />
        <TableOfContentsWrapper>{children}</TableOfContentsWrapper>
      </div>
      {editUrl && (
        <div className="mt-16 mb-8">
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
      )}
    </PrevNextNavigationWrapper>
  );
};
