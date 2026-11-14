"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EASE } from "../../lib/motion/gsap";
import { useShowHide } from "../../lib/motion/useShowHide";

const BELOW = { yPercent: 100 };
const SHEET_TIMING = { enter: 0.32, exit: 0.24, ease: EASE.drawer };

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
    <SheetLayers open={open} onClose={onClose} label={label}>
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
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string | undefined;
}) {
  const scrim = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  useShowHide(scrim, open);
  useShowHide(sheet, open, BELOW, SHEET_TIMING);

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
        className="invisible fixed inset-x-0 bottom-0 z-[51] max-h-[90%] overflow-y-auto rounded-t-sheet border-t border-white bg-card px-5 pt-2 pb-6 opacity-0"
      >
        <div className="mx-auto mt-1.5 mb-4 h-[5px] w-10 rounded-full bg-black/10" />
        {children}
      </div>
    </>
  );
}
