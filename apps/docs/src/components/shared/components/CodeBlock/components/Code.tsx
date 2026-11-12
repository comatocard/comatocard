import clsx from "clsx";
import type { ComponentProps } from "react";
import tw, { styled } from "twin.macro";

const StyledCode = styled.code`
  &[data-line-numbers] > .line:before {
    ${tw`text-grey-300 dark:text-grey-400 text-center`}
  }
`;

export const Code = ({ children, className, ...props }: ComponentProps<"code">) => {
  const hasLineNumbers = "data-line-numbers" in props;

  return (
    <StyledCode
      className={clsx(
        "py-0.5 px-1.5 rounded-md text-[0.9em] bg-grey-100 dark:bg-grey-900 break-words [box-decoration-break:clone] styled-code",
        { "[counter-reset:line]": hasLineNumbers },
        className,
      )}
      dir="ltr"
      {...props}
    >
      {children}
    </StyledCode>
  );
};
