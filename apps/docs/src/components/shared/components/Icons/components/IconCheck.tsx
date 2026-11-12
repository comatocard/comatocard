import clsx from "clsx";
import type { SVGProps } from "react";

const IconCheck = ({ color, ...otherProps }: SVGProps<SVGSVGElement> & { color?: string }) => (
  <svg
    aria-hidden="true"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...otherProps}
    className={clsx(otherProps?.className, {
      "text-grey-400 dark:text-grey-300": !otherProps?.className,
    })}
  >
    <path
      d="M5 13L9 17L19 7"
      stroke={color || "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export { IconCheck };
