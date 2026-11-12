import Link from "next/link";
import type { ComponentProps } from "react";

type AnchorProps = Omit<ComponentProps<"a">, "href"> & {
  href?: ComponentProps<typeof Link>["href"];
};

/** Markdown links: site routes through next/link, other sites in a new tab. */
export const Anchor = ({ href = "", children, ...props }: AnchorProps) => {
  if (typeof href !== "string" || href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
};
