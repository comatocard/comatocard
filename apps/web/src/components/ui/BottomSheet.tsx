"use client";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { EASE } from "../../lib/motion/gsap";
import { useShowHide } from "../../lib/motion/useShowHide";

const BELOW = { yPercent: 100 };
/** On a desktop the sheet is a panel that slides in from the right edge. */
const ASIDE = { x: 520 };
const SHEET_TIMING = { enter: 0.32, exit: 0.24, ease: EASE.drawer };

/**
 * A modal sheet: it rises from the bottom on a phone and slides in as a 480px side panel on a
 * desktop, so the page stays readable behind it. Both move with GSAP.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const isDesktop = useIsDesktop();
  // Mount flag gates createPortal to client-only; SSR has no document.body.
  useEffect(() => setMounted(true), []);

  // Escape closes, the same as Dialog and Drawer. Without it the only way out
  // of this sheet is a mouse on the scrim.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    // Keyed by layout: each one starts from its own hidden position, with no leftover transform.
    <SheetLayers
      key={isDesktop ? "panel" : "sheet"}
      open={open}
      onClose={onClose}
      label={label}
      side={isDesktop}
    >
      {children}
    </SheetLayers>,
    document.body,
  );
}

/** The scrim and the sheet, mounted inside the portal so their refs exist when GSAP runs. */
function SheetLayers({
  open,
  onClose,
  children,
  label,
  side,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string | undefined;
  side: boolean;
}) {
  const scrim = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  useShowHide(scrim, open);
  useShowHide(sheet, open, side ? ASIDE : BELOW, SHEET_TIMING);

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: presentational scrim; the keyboard path out is Escape, handled above */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same */}
      <div
        ref={scrim}
        data-testid="scrim"
        onClick={onClose}
        className="invisible fixed inset-0 z-50 bg-black/40 opacity-0 backdrop-blur-[2px]"
      />
      <div
        ref={sheet}
        data-testid="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className={
          side
            ? "invisible fixed top-4 right-4 bottom-4 z-[51] w-[480px] overflow-y-auto rounded-sheet border border-white bg-card px-7 pt-7 pb-7 opacity-0 [box-shadow:-12px_0_40px_rgba(0,0,0,.18)]"
            : "invisible fixed inset-x-0 bottom-0 z-[51] max-h-[90%] overflow-y-auto rounded-t-sheet border-t border-white bg-card px-5 pt-2 pb-6 opacity-0"
        }
      >
        {side ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 grid size-9 place-items-center rounded-full bg-bg text-ink transition-colors hover:bg-pill"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <div className="mx-auto mt-1.5 mb-4 h-[5px] w-10 rounded-full bg-black/10" />
        )}
        {children}
      </div>
    </>
  );
}
