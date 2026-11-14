"use client";
import { useCallback, useEffect, useState } from "react";
import { readStored, STORAGE, writeStored } from "../lib/storage";

/** Below this width the sidebar starts closed, so the content keeps its two columns. */
const ROOMY = 1100;

function initial(): boolean {
  if (typeof window === "undefined") return false;
  const stored = readStored(STORAGE.sidebar);
  if (stored !== null) return stored === "closed";
  return window.innerWidth < ROOMY;
}

/**
 * Whether the desktop sidebar is collapsed to its icon rail. The choice is kept per device, and
 * Cmd or Ctrl + B toggles it while `enabled` (a desktop viewport).
 */
export function useSidebar(enabled: boolean) {
  const [collapsed, setCollapsed] = useState(initial);

  const toggle = useCallback(() => {
    setCollapsed((value) => {
      writeStored(STORAGE.sidebar, value ? "open" : "closed");
      return !value;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, toggle]);

  return { collapsed, toggle };
}
