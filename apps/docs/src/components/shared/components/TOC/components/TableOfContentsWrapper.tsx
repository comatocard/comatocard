import { useRouter } from "next/router";
import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import { useNormalizedRoute } from "~/hooks/useIsHomePage";
import { selectDirectoriesByRoute } from "~/lib/directories/directories.selectors";

import { mainNavRoutes } from "../../Layout";
import { getHeadings, type Heading } from "../TOC.helpers";
import { TableOfContents } from "./TableOfContents";

type TableOfContentsWrapperProps = PropsWithChildren;

export const TableOfContentsWrapper: React.FC<TableOfContentsWrapperProps> = ({ children }) => {
  const { route } = useRouter();
  const normalizedRoute = useNormalizedRoute();
  const directoriesByRoute = useSelector(selectDirectoriesByRoute);

  const [headings, setHeadings] = useState<Heading[]>([]);

  const isMainPage = useMemo(() => mainNavRoutes.includes(normalizedRoute), [normalizedRoute]);
  const isSubCategoryPage = useMemo(
    () => directoriesByRoute[route]?.frontMatter?.pageType === "sub-category",
    [directoriesByRoute, route],
  );

  const shouldRenderTOC = !isMainPage && !isSubCategoryPage;

  // No dependency list: the headings are read from the rendered page after every render, and
  // state only changes when they differ, so navigation updates the TOC without a render loop.
  useEffect(() => {
    if (!shouldRenderTOC) return;
    const next = getHeadings();
    setHeadings((current) =>
      current.length === next.length && current.every((h, i) => h.id === next[i]?.id)
        ? current
        : next,
    );
  });

  if (!shouldRenderTOC) return <>{children}</>;

  return (
    <div className="grid grid-cols-10 gap-8">
      <div className="col-span-10 lg:col-span-6">{children}</div>

      <div className="col-start-8 col-span-3 hidden lg:block">
        <TableOfContents headings={headings} />
      </div>
    </div>
  );
};
