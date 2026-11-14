/**
 * Delays, in ms, of the extra refreshes after an owner action lands. Vault reads use `final`
 * finality, which trails an executed transaction by a couple of blocks, so a refresh right away
 * still returns the old state. These catch the change within seconds instead of at the next poll.
 */
export const SETTLE_REFRESH_MS = [1_500, 3_500, 7_000] as const;

type Schedule = (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
type Cancel = (timer: ReturnType<typeof setTimeout>) => void;

/** Refreshes now and again at each settle delay. Returns a function that cancels the rest. */
export function refreshUntilSettled(
  refresh: () => void,
  schedule: Schedule = setTimeout,
  cancel: Cancel = clearTimeout,
): () => void {
  refresh();
  const timers = SETTLE_REFRESH_MS.map((ms) => schedule(refresh, ms));
  return () => {
    for (const timer of timers) cancel(timer);
  };
}
