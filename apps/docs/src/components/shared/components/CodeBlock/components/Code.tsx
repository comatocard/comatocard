import clsx from "clsx";
import type { ComponentProps } from "react";

export const Code = ({ children, className, ...props }: ComponentProps<"code">) => (
  <code
    className={clsx(
      "py-0.5 px-1.5 rounded-md text-[0.9em] bg-grey-100 dark:bg-grey-900 break-words [box-decoration-break:clone] styled-code",
      className,
    )}
    dir="ltr"
    {...props}
  >
    {children}
  </code>
);
