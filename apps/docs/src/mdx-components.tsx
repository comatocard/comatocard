import { useMDXComponents as getNextraComponents, type MDXComponents } from "nextra/mdx-components";

import { Code, Heading, HeadingLink, Pre } from "~/components/shared";

const text = "text-base leading-[160%] text-grey-400 dark:text-grey-300";

const components: MDXComponents = {
  table: (props) => (
    <div className="overflow-x-auto mt-8 first:mt-0">
      <table {...props} />
    </div>
  ),
  // An h1 in Markdown renders as h2, since the hero already shows the page title.
  h1: (props) => <HeadingLink tag="h2" {...props} />,
  h2: (props) => <HeadingLink tag="h2" {...props} />,
  h3: (props) => <Heading tag="h3" {...props} />,
  h4: (props) => <Heading tag="h4" {...props} />,
  h5: (props) => <Heading tag="h5" {...props} />,
  h6: (props) => <Heading tag="h6" {...props} />,
  p: (props) => <p className={`${text} mt-8 first:mt-0`} {...props} />,
  ul: (props) => (
    <ul
      className="mt-8 first:mt-0 list-disc ml-[28px] [&_li]:pl-2 [&_li]:marker:text-xs"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="mt-8 first:mt-0 list-decimal ml-[32px] [&_li]:pl-1 [&_li]:marker:font-medium"
      {...props}
    />
  ),
  li: (props) => <li className={`my-2 ${text} relative`} {...props} />,
  hr: (props) => (
    <hr className="my-8 first:mt-0 border-t border-grey-200 dark:border-grey-600" {...props} />
  ),
  blockquote: (props) => (
    <blockquote
      className={`mt-8 first:mt-0 py-4 px-6 border-l border-[#E34ED6] dark:border-[#00C6EE] ${text}`}
      {...props}
    />
  ),
  pre: Pre,
  code: Code,
};

export function useMDXComponents(overrides?: MDXComponents): MDXComponents {
  return { ...getNextraComponents(), ...components, ...overrides };
}
