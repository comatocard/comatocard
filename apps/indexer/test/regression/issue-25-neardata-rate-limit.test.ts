// Regression for #25: a backfill without an API key gave up on neardata 429 responses.
import { describe, expect, it } from "vitest";
import {
  FREE_TIER_INTERVAL_MS,
  MAX_RETRY_AFTER_MS,
  neardataSource,
  retryAfterMs,
} from "../../src/neardata/client.js";
import { makeBlock } from "../support/blocks.js";

/**
 * A clock that only moves when the client sleeps. Sleeps wake in deadline order after every
 * pending microtask ran, so concurrent sleeps overlap like real timers.
 */
function virtualClock() {
  let time = 0;
  let scheduled = false;
  const sleeps: number[] = [];
  const timers: { deadline: number; wake: () => void }[] = [];
  const drain = () => {
    scheduled = false;
    timers.sort((a, b) => a.deadline - b.deadline);
    const next = timers.shift();
    if (!next) return;
    time = Math.max(time, next.deadline);
    next.wake();
    if (timers.length > 0) schedule();
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      setImmediate(drain);
    }
  };
  return {
    now: () => time,
    sleep: (ms: number) => {
      sleeps.push(ms);
      return new Promise<void>((wake) => {
        timers.push({ deadline: time + ms, wake });
        schedule();
      });
    },
    sleeps,
    starts: [] as number[],
  };
}

const ok = () => new Response(JSON.stringify(makeBlock(1, [])), { status: 200 });

describe("issue 25: neardata rate limit", () => {
  it("paces requests below the free tier without an API key", async () => {
    const clock = virtualClock();
    const source = neardataSource({
      baseUrl: "https://n.example",
      fetch: async () => {
        clock.starts.push(clock.now());
        return ok();
      },
      sleep: clock.sleep,
      now: clock.now,
    });
    await Promise.all([source.block(1), source.block(2), source.block(3)]);
    await source.block(4);
    const gaps = clock.starts.slice(1).map((t, i) => t - (clock.starts[i] ?? 0));
    expect(gaps.every((gap) => gap >= FREE_TIER_INTERVAL_MS)).toBe(true);
    expect((60_000 / FREE_TIER_INTERVAL_MS) | 0).toBeLessThanOrEqual(180);
  });

  it("does not pace when an API key is configured", async () => {
    const clock = virtualClock();
    const source = neardataSource({
      baseUrl: "https://n.example",
      apiKey: "key",
      fetch: async () => ok(),
      sleep: clock.sleep,
      now: clock.now,
    });
    await source.block(1);
    await source.block(2);
    expect(clock.sleeps).toEqual([]);
  });

  it("waits at least Retry-After and outlasts a rate limit window", async () => {
    const clock = virtualClock();
    let calls = 0;
    const source = neardataSource({
      baseUrl: "https://n.example",
      apiKey: "key",
      backoffMs: 1_000,
      fetch: async () => {
        calls += 1;
        if (calls <= 5) {
          return new Response("{}", { status: 429, headers: { "retry-after": "7" } });
        }
        return ok();
      },
      sleep: clock.sleep,
      now: clock.now,
    });
    await expect(source.block(1)).resolves.not.toBeNull();
    expect(clock.sleeps).toEqual([7_000, 7_000, 7_000, 8_000, 16_000]);
  });

  it("keeps backing off when Retry-After is 0 during an active limit", async () => {
    const clock = virtualClock();
    let calls = 0;
    const retries: number[] = [];
    const source = neardataSource({
      onRetry: (retry) => retries.push(retry.attempt),
      baseUrl: "https://n.example",
      apiKey: "key",
      backoffMs: 1_000,
      maxBackoffMs: 8_000,
      fetch: async () => {
        calls += 1;
        if (calls <= 5) {
          return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
        }
        return ok();
      },
      sleep: clock.sleep,
      now: clock.now,
    });
    await expect(source.block(1)).resolves.not.toBeNull();
    expect(clock.sleeps).toEqual([1_000, 2_000, 4_000, 8_000, 8_000]);
    expect(retries).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses Retry-After seconds and caps it", () => {
    expect(retryAfterMs("3")).toBe(3_000);
    expect(retryAfterMs("100000")).toBe(MAX_RETRY_AFTER_MS);
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
  });
});
