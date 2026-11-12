import clsx from "clsx";

/** Comatocard Docs wordmark: a card glyph and the name, in the current text colour. */
export const IconDocsLogo = ({ className }: { className?: string }) => (
  <span className={clsx("inline-flex items-center gap-1.5 text-[15px] leading-none", className)}>
    <svg
      width="24"
      height="17"
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="0.75"
        y="0.75"
        width="26.5"
        height="18.5"
        rx="3.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="1" y="5" width="26" height="3.5" fill="currentColor" />
      <rect x="5" y="12.5" width="8" height="2.5" rx="1.25" fill="currentColor" />
    </svg>
    <span className="font-semibold tracking-[-0.2px]">
      comatocard <span className="font-normal opacity-60">docs</span>
    </span>
  </span>
);
