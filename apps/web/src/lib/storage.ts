/**
 * Local storage keys, all under the `comatocard.` prefix. Storage holds conveniences only (the
 * selected vault, a seen tour); it can be blocked, so every read and write tolerates failure.
 */
export const STORAGE = {
  /** The vault last opened on this device. */
  vault: "comatocard.vault.v1",
  /** "1" once the three-step tour has been seen or skipped. */
  onboardingDone: "comatocard.onboarding.done",
} as const;

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; the app works without it.
  }
}
