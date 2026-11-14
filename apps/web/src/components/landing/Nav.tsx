"use client";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { DURATION, EASE, gsap, prefersReducedMotion } from "../../lib/motion/gsap";
import { cn } from "../../lib/utils";
import { APP_LINK, NAV_ITEMS } from "./links";

/**
 * The fixed header: white over the photo, dark once the page below is open. Open app stays in it
 * at every width. On a phone the section links live in a panel that drops from the top with GSAP,
 * its rows following one after another.
 */
export function Nav({
  dark,
  active,
  menuOpen,
  onToggleMenu,
  onNavigate,
}: {
  dark: boolean;
  active: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onNavigate: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  // The mobile panel is near-black, so the header stays white while it is open.
  const d = dark && !menuOpen;

  // The panel rests above the screen through a `transform` class, which GSAP then owns. Tailwind's
  // own translate utilities write the separate `translate` property, which GSAP never touches:
  // with one of those the panel stayed off screen however far the tween moved it.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const instant = first.current || prefersReducedMotion();
    first.current = false;
    const duration = instant ? 0 : 0.5;
    const tweens = [
      gsap.to(el, {
        y: 0,
        yPercent: menuOpen ? 0 : -100,
        duration,
        ease: EASE.drawer,
        overwrite: true,
      }),
      gsap.to(scrim.current, {
        autoAlpha: menuOpen ? 1 : 0,
        duration: instant ? 0 : DURATION.enter,
        overwrite: true,
      }),
      gsap.to(el.querySelectorAll("[data-menu-row]"), {
        opacity: menuOpen ? 1 : 0,
        y: menuOpen ? 0 : 12,
        duration: instant ? 0 : 0.4,
        ease: EASE.out,
        stagger: menuOpen ? 0.04 : 0,
        delay: menuOpen && !instant ? 0.08 : 0,
        overwrite: true,
      }),
    ];
    return () => {
      for (const tween of tweens) tween.kill();
    };
  }, [menuOpen]);

  const link = (id: string) => ({
    href: `#${id}`,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      onNavigate(id);
    },
  });

  return (
    <>
      <button
        ref={scrim}
        type="button"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={onToggleMenu}
        className="invisible fixed inset-0 z-[54] bg-black/60 opacity-0 backdrop-blur-sm md:hidden"
      />
      <div
        ref={panel}
        className="fixed inset-x-0 top-0 z-[55] bg-[#0A0B11]/[0.98] px-5 pt-20 pb-8 [transform:translateY(-100%)] md:hidden"
      >
        <nav aria-label="Sections" className="flex flex-col">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.target}
              data-menu-row
              {...link(item.target)}
              className={cn(
                "py-3 text-lg opacity-0",
                active === item.target ? "text-white" : "text-white/70",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <header
        className={cn(
          "fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 md:px-10",
        )}
      >
        {/* Once the page is open, content scrolls under the header. The backdrop is a blur that
            thins out downwards instead of ending in a flat edge: three layers, each masked a
            little shorter, under a tint that fades the same way. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[168%] transition-opacity duration-500",
            d ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="absolute inset-0 [backdrop-filter:blur(3px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)]" />
          <span className="absolute inset-0 [backdrop-filter:blur(8px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_42%,transparent_78%)]" />
          <span className="absolute inset-0 [backdrop-filter:blur(16px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_26%,transparent_58%)]" />
          <span className="absolute inset-0 [background:linear-gradient(to_bottom,rgba(244,240,237,.9)_0%,rgba(244,240,237,.72)_45%,rgba(244,240,237,0)_100%)]" />
        </span>
        <span className="flex items-center gap-2.5">
          <Image src="/comatocard-icon.svg" alt="" width={24} height={24} className="size-6" />
          <span
            className={cn(
              "text-sm font-medium tracking-wide uppercase transition-colors duration-500",
              d ? "text-[#18161B]" : "text-white",
            )}
          >
            Comatocard
          </span>
        </span>

        <nav
          aria-label="Sections"
          className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center rounded-full p-1.5 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.target}
              {...link(item.target)}
              aria-current={active === item.target ? "true" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-colors duration-500",
                navTone(active === item.target, d),
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Open app stays in reach on a phone too, beside the menu button. */}
        <div className="flex items-center gap-1.5">
          <Link
            {...APP_LINK}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-medium transition-[background-color,color,transform] duration-300 active:scale-[.97] md:px-5 md:py-2.5 md:text-sm",
              d ? "bg-[#18161B] text-white" : "bg-white text-ink",
            )}
          >
            Open app
          </Link>

          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className={cn(
              "grid size-10 place-items-center rounded-full transition-colors duration-500 md:hidden",
              d ? "text-[#18161B]" : "text-white",
            )}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>
    </>
  );
}

function navTone(active: boolean, dark: boolean): string {
  if (active) return dark ? "bg-[#18161B] text-white" : "bg-white text-ink";
  return dark ? "text-[#18161B]/70 hover:text-[#18161B]" : "text-white/70 hover:text-white";
}
