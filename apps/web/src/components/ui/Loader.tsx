import { cn } from "../../lib/utils";

/**
 * A spinning arc with a fading tail. Constant motion, so it runs on a linear CSS rotation that
 * stays smooth while the main thread is busy loading; a fast turn makes the wait feel shorter.
 */
export function Loader({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-block size-5 shrink-0", className)}>
      <svg
        viewBox="0 0 24 24"
        className="size-full motion-safe:animate-[spin_0.7s_linear_infinite]"
      >
        <title>Loading</title>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".12"
          strokeWidth="2.5"
        />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** A loader beside a short line, for the bottom of a skeleton screen. */
export function LoadingLine({ children }: { children: string }) {
  return (
    <p className="flex items-center justify-center gap-2.5 text-[13px] text-muted" role="status">
      <Loader className="size-4 text-ink" />
      {children}
    </p>
  );
}
