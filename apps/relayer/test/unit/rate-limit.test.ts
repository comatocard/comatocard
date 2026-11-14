import { describe, expect, it } from "vitest";
import { rateLimiter } from "../../src/rate-limit.js";

describe("rateLimiter", () => {
  it("allows the limit per key in a window and resets after it", () => {
    const allow = rateLimiter(2, 1_000);
    expect([allow("a", 0), allow("a", 10), allow("a", 20)]).toEqual([true, true, false]);
    expect(allow("b", 20)).toBe(true);
    expect(allow("a", 1_000)).toBe(true);
  });

  it("forgets expired windows once many keys were seen", () => {
    const allow = rateLimiter(1, 1_000);
    for (let i = 0; i < 1_000; i += 1) allow(`k${i}`, 0);
    expect(allow("k0", 500)).toBe(false);
    // A new key after the windows expired sweeps them, so k0 starts a fresh window.
    expect(allow("new", 2_000)).toBe(true);
    expect(allow("k0", 2_000)).toBe(true);
  });
});
