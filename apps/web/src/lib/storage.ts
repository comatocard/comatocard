/**
 * Local storage keys, all under the `comatocard.` prefix. Storage holds conveniences only (the
 * selected vault per account); it can be blocked, so every read and write tolerates failure.
 */
export const STORAGE = {
  /** The vault an account last opened on this device. */
  vault: (account: string) => `comatocard.vault.v2.${account}`,
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
