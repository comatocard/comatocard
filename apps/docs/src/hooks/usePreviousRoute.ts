"use client";

// Routes of this tab: the page shown before the current one. Module state, so it survives the
// page remounts of the App Router; on the server it stays empty, so prerendered HTML and the
// first client render agree.
let current: string | undefined;
let previous: string | undefined;

export const usePreviousRoute = (route: string): string | undefined => {
  if (typeof window === "undefined") return undefined;
  if (route !== current) {
    previous = current;
    current = route;
  }
  return previous;
};
