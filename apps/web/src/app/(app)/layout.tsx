"use client";
import { usePathname } from "next/navigation";
import { type ReactNode, type TouchEvent, useLayoutEffect, useRef, useState } from "react";
import { AuthGate } from "../../components/AuthGate";
import { BottomNav, SHELL, SIDEBAR, Sidebar, TopBlur } from "../../components/ui";
import { VaultGuard } from "../../components/VaultGuard";
import { useApprovals } from "../../hooks/data";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useNav } from "../../hooks/useNav";
import { useSidebar } from "../../hooks/useSidebar";
import { useVault } from "../../hooks/useVault";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";

/** Swipe order follows the bottom bar. */
const SHELL_ROUTES: readonly string[] = ["/home", "/approvals", "/activity", "/account"];
const SIDEBAR_MOVE = { duration: 0.24, ease: EASE.drawer };
type SwipeStart = { x: number; y: number };
/** How far a new page slides in on a phone, in px. */
const PAGE_SHIFT = 28;
/** How far a new page rises into place on a desktop, in px. */
const PAGE_RISE = 10;

export default function AppLayout({ children }: { children: ReactNode }) {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const swipeStart = useRef<SwipeStart | null>(null);
  const [enterDirection, setEnterDirection] = useState<"next" | "prev">("next");
  const routeIndex = SHELL_ROUTES.indexOf(pathname);
  const { vaultId } = useVault();
  const pending = useApprovals(vaultId).data?.items.length ?? 0;
  const page = useRef<HTMLDivElement>(null);
  // Every new page enters with GSAP: on a phone it slides in from the side it came from, on a
  // desktop it rises a little and fades. Props are cleared at the end: a transform left on the
  // wrapper would trap the `fixed` sheets inside it.
  useLayoutEffect(() => {
    const el = page.current;
    if (!el || !pathname) return;
    const still = prefersReducedMotion();
    const side = enterDirection === "prev" ? -PAGE_SHIFT : PAGE_SHIFT;
    const from = isDesktop ? { y: still ? 0 : PAGE_RISE } : { x: still ? 0 : side };
    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, ...from },
      {
        autoAlpha: 1,
        x: 0,
        y: 0,
        duration: DURATION.enter,
        ease: EASE.out,
        clearProps: "transform,opacity,visibility",
      },
    );
    return () => {
      tween.progress(1).kill();
    };
  }, [pathname, isDesktop, enterDirection]);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktop || routeIndex === -1 || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (isDesktop || routeIndex === -1 || !start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const committed = Math.abs(dx) >= 68 && Math.abs(dx) > Math.abs(dy) * 1.35;
    if (!committed) return;
    const nextRoute = SHELL_ROUTES[dx < 0 ? routeIndex + 1 : routeIndex - 1];
    if (!nextRoute) return;
    setEnterDirection(dx < 0 ? "next" : "prev");
    nav.forward(nextRoute);
  };

  return (
    <AuthGate>
      <div
        data-app-shell
        className="relative min-h-dvh"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
      >
        <div className="lg:hidden">
          <TopBlur />
        </div>
        <DesktopFrame isDesktop={isDesktop} badge={pending}>
          <div className={`${SHELL} pb-[120px] pt-14 lg:pb-16 lg:pt-9`}>
            <div key={pathname} ref={page}>
              <VaultGuard>{children}</VaultGuard>
            </div>
          </div>
        </DesktopFrame>
        <div className="lg:hidden">
          <BottomNav badge={pending} />
        </div>
      </div>
    </AuthGate>
  );
}

/**
 * The desktop sidebar and the content beside it. It lives under `AuthGate`, so it mounts with its
 * nodes in place: the content's left edge is set at once on the first desktop paint and tweens
 * with the sidebar after that. On a phone it is only a wrapper.
 */
function DesktopFrame({
  isDesktop,
  badge,
  children,
}: {
  isDesktop: boolean;
  badge: number;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const wasDesktop = useRef(false);
  const { collapsed, toggle } = useSidebar(isDesktop);
  const sidebarWidth = collapsed ? SIDEBAR.closed : SIDEBAR.open;

  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const paddingLeft = isDesktop ? sidebarWidth : 0;
    // Only a toggle animates; arriving at the desktop layout places the content directly.
    const animate = isDesktop && wasDesktop.current && !prefersReducedMotion();
    wasDesktop.current = isDesktop;
    if (!animate) {
      gsap.set(el, { paddingLeft });
      return;
    }
    const tween = gsap.to(el, { paddingLeft, ...SIDEBAR_MOVE, overwrite: true });
    return () => {
      tween.kill();
    };
  }, [isDesktop, sidebarWidth]);

  return (
    <>
      {/* The sidebar mounts only once a desktop viewport is confirmed, so its hooks never run on
          a phone. */}
      {isDesktop ? <Sidebar collapsed={collapsed} onToggle={toggle} badge={badge} /> : null}
      <div ref={content}>{children}</div>
    </>
  );
}
