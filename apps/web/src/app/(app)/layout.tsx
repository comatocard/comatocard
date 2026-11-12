"use client";
import { usePathname } from "next/navigation";
import { type ReactNode, type TouchEvent, useRef, useState } from "react";
import { AuthGate } from "../../components/AuthGate";
import { AccountMenu } from "../../components/desktop/AccountMenu";
import { BottomNav, DesktopNav, SHELL, TopBlur } from "../../components/ui";
import { VaultGuard } from "../../components/VaultGuard";
import { useApprovals } from "../../hooks/data";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useNav } from "../../hooks/useNav";
import { useVault } from "../../hooks/useVault";

/** Swipe order follows the bottom bar. */
const SHELL_ROUTES: readonly string[] = ["/home", "/approvals", "/account"];
type SwipeStart = { x: number; y: number };

export default function AppLayout({ children }: { children: ReactNode }) {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const swipeStart = useRef<SwipeStart | null>(null);
  const [enterDirection, setEnterDirection] = useState<"next" | "prev">("next");
  const routeIndex = SHELL_ROUTES.indexOf(pathname);
  const { vaultId } = useVault();
  const pending = useApprovals(vaultId).data?.items.length ?? 0;
  const enterClass = enterDirection === "prev" ? "page-enter page-enter-prev" : "page-enter";

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
        {/* AccountMenu mounts only once a desktop viewport is confirmed, so its hooks never run
            on a phone. */}
        <DesktopNav account={isDesktop ? <AccountMenu /> : undefined} badge={pending} />
        <div className={`${SHELL} pb-[120px] pt-14 lg:pb-16 lg:pt-8`}>
          <div key={pathname} className={isDesktop ? undefined : enterClass}>
            <VaultGuard>{children}</VaultGuard>
          </div>
        </div>
        <div className="lg:hidden">
          <BottomNav badge={pending} />
        </div>
      </div>
    </AuthGate>
  );
}
