"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SHELL } from "./shell";

/**
 * The desktop navigation bar: the same tabs as the bottom bar, plus History, which phones reach
 * from Home. It shares `SHELL` with the content column so the brand lines up with the first card.
 */
const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/approvals", label: "Approvals" },
  { href: "/account", label: "Account" },
] as const;

function Item({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-full px-3.5 text-[14px] font-medium transition-colors ${
        active
          ? "border border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-12px_rgba(17,19,22,.26)]"
          : "border border-transparent text-muted hover:bg-pill hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function DesktopNav({ account, badge = 0 }: { account?: ReactNode; badge?: number }) {
  const path = usePathname();

  // `hidden lg:block` sits on the header itself rather than on a wrapper, and that is load-bearing:
  // `position: sticky` only sticks inside its own parent's box, so a wrapper collapsed to the bar's
  // own height would pin it to nothing and it would scroll away like a static element.
  return (
    <header className="sticky top-0 z-50 hidden border-b border-line bg-bg/80 [backdrop-filter:saturate(1.4)_blur(12px)] lg:block">
      {/* Same container as the content column below, so the brand lines up with the first card. */}
      <div className={`${SHELL} flex h-16 items-center gap-4`}>
        <Link href="/home" className="inline-flex shrink-0 items-center gap-[9px]">
          <Image
            src="/comatocard-icon.svg"
            alt=""
            width={512}
            height={512}
            className="h-[24px] w-[24px]"
            priority
          />
          <span className="text-[17px] font-bold tracking-[-0.02em]">Comatocard</span>
        </Link>

        {/* "Primary" rather than "Main": the mobile bottom nav already owns that name, and
            although the two are mutually exclusive by viewport, `display:none` takes the other
            out of the accessibility tree entirely: two landmarks sharing a name is ambiguous
            anywhere CSS is not applied, the test renderer included. */}
        {/* A hairline between the mark and the links. Without it the active pill sits 28px from the
            wordmark and the two read as one blob: the brand appearing to have a tab attached. */}
        <span aria-hidden className="h-5 w-px shrink-0 bg-line-2" />

        <nav aria-label="Primary" className="flex items-center gap-1">
          {LINKS.map((link) => (
            <Item key={link.href} href={link.href} active={path.startsWith(link.href)}>
              {link.label}
              {link.href === "/approvals" && badge > 0 ? (
                <span className="ml-1.5 rounded-full bg-neg px-1.5 text-[11px] font-semibold text-white">
                  {badge}
                </span>
              ) : null}
            </Item>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Item href="/activity" active={path === "/activity"}>
            History
          </Item>
          {account}
        </div>
      </div>
    </header>
  );
}
