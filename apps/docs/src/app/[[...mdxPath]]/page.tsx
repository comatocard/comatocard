import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMdx } from "nextra/compile";
import { MDXRemote } from "nextra/mdx-remote";

import { HomePage } from "~/components/Home";
import { CurrentPageNavigationSections, MainContentWrapper } from "~/components/shared";
import { toMdx } from "~/lib/markdown.mjs";
import { isOverview, pageAt, pages } from "~/lib/site";
import { useMDXComponents as getMDXComponents } from "~/mdx-components";

type Props = { params: Promise<{ mdxPath?: string[] }> };

/** `next build` runs in apps/docs; page sources are repository paths. */
const REPO = join(process.cwd(), "../..");

// A plain function despite the name Next requires for mdx-components; built once for all pages.
const components = getMDXComponents();

export const dynamicParams = false;

export const generateStaticParams = () =>
  pages.map((page) => ({ mdxPath: page.route.split("/").filter(Boolean) }));

const pageOf = async (props: Props) => {
  const { mdxPath = [] } = await props.params;
  const route = `/${mdxPath.join("/")}`;
  return { route, page: pageAt(route) };
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { route, page } = await pageOf(props);
  if (!page) return {};
  const canonical = route === "/" ? "./" : `.${route}/`;
  return {
    ...(route === "/" ? {} : { title: page.title }),
    description: page.description,
    alternates: { canonical },
    openGraph: { url: canonical, description: page.description },
  };
}

export default async function Page(props: Props) {
  const { route, page } = await pageOf(props);
  if (!page) notFound();
  if (route === "/") return <HomePage />;

  if (isOverview(route) || !page.source) {
    return (
      <MainContentWrapper route={route}>
        <CurrentPageNavigationSections />
      </MainContentWrapper>
    );
  }

  const markdown = await readFile(join(REPO, page.source), "utf8");
  const compiledSource = await compileMdx(toMdx(markdown, page.source), {
    defaultShowCopyCode: true,
    filePath: page.source,
  });

  return (
    <MainContentWrapper route={route}>
      <MDXRemote compiledSource={compiledSource} components={components} />
    </MainContentWrapper>
  );
}
