import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshUntilSettled, SETTLE_REFRESH_MS } from "../src/lib/settle";

const LAST = Math.max(...SETTLE_REFRESH_MS);
const FIRST = Math.min(...SETTLE_REFRESH_MS);

// Issue #160: after a freeze the card kept its old status until the 15 s poll, because the one
// refresh ran before the transaction reached `final` finality.
describe("issue 160: refresh after an owner action", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes at once and again until the change is final", () => {
    const refresh = vi.fn();
    refreshUntilSettled(refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LAST);
    expect(refresh).toHaveBeenCalledTimes(1 + SETTLE_REFRESH_MS.length);
  });

  it("catches the change well before the 15 s poll", () => {
    expect(FIRST).toBeLessThanOrEqual(2_000);
    expect(LAST).toBeLessThan(15_000);
  });

  it("stops the remaining refreshes when cancelled", () => {
    const refresh = vi.fn();
    const cancel = refreshUntilSettled(refresh);
    vi.advanceTimersByTime(FIRST);
    cancel();
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
