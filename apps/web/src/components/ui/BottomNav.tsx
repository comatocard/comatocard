"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/home", label: "Home", icon: <path d="M4 11l8-7 8 7M6 10v9h12v-9" /> },
  {
    href: "/approvals",
    label: "Approvals",
    icon: (
      <>
        <path d="M4 13h4l2 3h4l2-3h4" />
        <path d="M5 13l2-8h10l2 8v6H5z" />
      </>
    ),
  },
  {
    href: "/account",
    label: "Account",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </>
    ),
  },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** `badge` is the number of payments waiting for approval, shown on the Approvals tab. */
export function BottomNav({ badge = 0 }: { badge?: number }) {
  const path = usePathname();
  return (
    <>
      {/* progressive blur overlay above the nav */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[38] h-[104px] overflow-hidden"
      >
        <div className="absolute inset-0 [backdrop-filter:blur(2px)] [mask-image:linear-gradient(to_top,#000_0%,#000_52%,transparent_100%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(5px)] [mask-image:linear-gradient(to_top,#000_0%,#000_30%,transparent_58%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(9px)] [mask-image:linear-gradient(to_top,#000_0%,#000_15%,transparent_36%)]" />
        <div className="absolute inset-0 [background:linear-gradient(180deg,transparent,rgba(242,242,242,.5))]" />
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[88px] items-start justify-around px-6 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-[52px] flex-col items-center justify-center gap-[3px] rounded-[18px] border px-[18px] text-[11px] font-medium transition-colors ${active ? "border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-14px_rgba(17,19,22,.28)]" : "border-transparent text-faint hover:text-muted"}`}
            >
              <span className="relative">
                <Icon>{t.icon}</Icon>
                {t.href === "/approvals" && badge > 0 ? (
                  <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-neg px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {badge}
                  </span>
                ) : null}
              </span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
