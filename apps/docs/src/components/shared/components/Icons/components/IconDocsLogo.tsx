import clsx from "clsx";

/** Comatocard Docs wordmark: the Comatocard mark (`apps/web/public/comatocard-icon.svg`) and the name. */
export const IconDocsLogo = ({ className }: { className?: string }) => (
  <span className={clsx("inline-flex items-center gap-2 text-[15px] leading-none", className)}>
    <svg
      width="22"
      height="22"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="comatocard-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d3d40" />
          <stop offset="1" stopColor="#111316" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#comatocard-mark)" />
      <path
        d="M338 176a116 116 0 1 0 0 160"
        fill="none"
        stroke="#f8f8f8"
        strokeWidth="54"
        strokeLinecap="round"
      />
      <rect x="300" y="232" width="92" height="48" rx="14" fill="#f8f8f8" />
    </svg>
    <span className="font-semibold tracking-[-0.2px]">
      comatocard <span className="font-normal opacity-60">docs</span>
    </span>
  </span>
);
