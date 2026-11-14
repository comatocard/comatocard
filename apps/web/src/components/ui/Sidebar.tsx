"use client";
import {
  House,
  Inbox,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { shortAccount, useSession } from "../../hooks/useSession";
import { useVault } from "../../hooks/useVault";
import { vaultLabel } from "../../lib/cards";
import { EASE } from "../../lib/motion/gsap";
import { useShowHide, useTweenTo } from "../../lib/motion/useShowHide";
import { Identicon } from "../account/Identicon";

/** Widths of the sidebar, in px: with labels, and as an icon rail. */
export const SIDEBAR = { open: 248, closed: 76 } as const;

const ITEMS: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/approvals", label: "Approvals", icon: Inbox },
  { href: "/activity", label: "History", icon: ReceiptText },
  { href: "/account", label: "Account", icon: UserRound },
];

const MOVE = { duration: 0.24, ease: EASE.drawer };
const LABEL_HIDDEN = { x: -6 };
/** The toggle sits right of the logo when open and under it on the rail. */
const TOGGLE_OPEN = { x: SIDEBAR.open - 16 - 36, y: 0 };
const TOGGLE_CLOSED = { x: (SIDEBAR.closed - 36) / 2, y: 44 };

/** Text that fades and slides away when the sidebar collapses; it keeps its place in the row. */
function Label({ show, children }: { show: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useShowHide(ref, show, LABEL_HIDDEN, { enter: 0.2, exit: 0.12 });
  return (
    <span ref={ref} className="invisible flex min-w-0 flex-1 items-center opacity-0">
      {children}
    </span>
  );
}

/** The count on the icon itself, shown only on the rail where the row has no room for it. */
function RailBadge({ show, count }: { show: boolean; count: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useShowHide(ref, show);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="invisible absolute -top-1.5 -right-2 min-w-4 rounded-full bg-neg px-1 text-center text-[10px] leading-4 font-semibold text-white opacity-0"
    >
      {count}
    </span>
  );
}

/**
 * The desktop navigation: a sidebar that collapses to an icon rail. Width, labels and the toggle
 * all move with GSAP; reduced motion jumps. `badge` is the number of payments waiting.
 */
export function Sidebar({
  collapsed,
  onToggle,
  badge = 0,
}: {
  collapsed: boolean;
  onToggle: () => void;
  badge?: number;
}) {
  const path = usePathname();
  const { accountId } = useSession();
  const { vaultId } = useVault();
  const aside = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const account = useRef<HTMLAnchorElement>(null);
  useTweenTo(aside, { width: collapsed ? SIDEBAR.closed : SIDEBAR.open }, MOVE);
  useTweenTo(toggle, collapsed ? TOGGLE_CLOSED : TOGGLE_OPEN, MOVE);
  // The links step down on the rail to make room for the toggle under the logo, and narrow with
  // it so the active pill stays a whole shape instead of being cut by the edge.
  const inner = (collapsed ? SIDEBAR.closed : SIDEBAR.open) - 28;
  useTweenTo(nav, { y: collapsed ? 44 : 0, width: inner }, MOVE);
  useTweenTo(account, { width: inner }, MOVE);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      ref={aside}
      data-collapsed={collapsed}
      className="fixed inset-y-0 left-0 z-40 hidden flex-col justify-between overflow-hidden bg-[#eaeaec] px-3.5 pt-7 pb-5 lg:flex"
      style={{ width: SIDEBAR.open }}
    >
      <div className="relative">
        <Link href="/home" className="flex h-9 items-center gap-2.5 pl-[11px]">
          <Image
            src="/comatocard-icon.svg"
            alt=""
            width={512}
            height={512}
            className="size-[26px] shrink-0"
            priority
          />
          <Label show={!collapsed}>
            <span className="text-[16px] font-semibold tracking-[-0.01em] whitespace-nowrap">
              Comatocard
            </span>
          </Label>
        </Link>
        <button
          ref={toggle}
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar-nav"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={
            collapsed ? "Expand sidebar (Ctrl or Cmd + B)" : "Collapse sidebar (Ctrl or Cmd + B)"
          }
          className="absolute top-0 left-0 grid size-9 place-items-center rounded-[10px] text-muted transition-colors hover:bg-white/70 hover:text-ink"
          style={{ marginLeft: -14 }}
        >
          <ToggleIcon size={17} strokeWidth={2} aria-hidden="true" />
        </button>

        <nav ref={nav} id="app-sidebar-nav" aria-label="Primary" className="mt-7 grid gap-1">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(`${href}/`);
            const count = href === "/approvals" ? badge : 0;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={count > 0 ? `${label}, ${count} waiting` : label}
                className={`group relative flex h-11 items-center gap-3 overflow-hidden rounded-[14px] pl-[15px] pr-3 text-[14.5px] transition-colors ${
                  active
                    ? "bg-white font-semibold text-ink"
                    : "font-medium text-muted hover:bg-white/60 hover:text-ink"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  {count > 0 ? <RailBadge show={collapsed} count={count} /> : null}
                </span>
                <Label show={!collapsed}>
                  <span className="flex-1 whitespace-nowrap">{label}</span>
                  {count > 0 ? (
                    <span className="grid size-5 place-items-center rounded-full bg-neg text-[11px] font-bold text-white">
                      {count}
                    </span>
                  ) : null}
                </Label>
              </Link>
            );
          })}
        </nav>
      </div>

      <Link
        ref={account}
        href="/account"
        aria-label="Account"
        className="flex h-14 items-center gap-2.5 overflow-hidden rounded-2xl bg-white pl-2 pr-3 transition-colors hover:bg-white/80"
      >
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full">
          <Identicon address={accountId ?? ""} size={32} />
        </span>
        <Label show={!collapsed}>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold">
              {vaultId ? vaultLabel(vaultId) : "No card account"}
            </span>
            <span className="block truncate text-xs text-muted">
              {accountId ? shortAccount(accountId) : ""}
            </span>
          </span>
        </Label>
      </Link>
    </aside>
  );
}
