import { describe, expect, it, vi } from "vitest";
import { NeardataError, neardataSource } from "../../src/neardata/client.js";
import { makeBlock } from "../support/blocks.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("neardataSource", () => {
  it("reads the final height and blocks, passing the API key", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      return path.endsWith("/final") ? json(makeBlock(42, [])) : json(makeBlock(41, []));
    });
    const source = neardataSource({ baseUrl: "https://n.example", apiKey: "k", fetch });
    // With an API key requests are not paced, so this test needs no clock.
    await expect(source.finalHeight()).resolves.toBe(42);
    await expect(source.block(41)).resolves.toMatchObject({ block: { header: { height: 41 } } });
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://n.example/v0/last_block/final?apiKey=k");
  });

  it("returns null for heights without a block", async () => {
    const source = neardataSource({ baseUrl: "https://n.example", fetch: async () => json(null) });
    await expect(source.block(5)).resolves.toBeNull();
  });

  it("retries rate limits, server errors and network failures", async () => {
    const responses = [
      () => json({}, 429),
      () => {
        throw new TypeError("socket hang up");
      },
      () => json({}, 503),
      () => json(makeBlock(9, [])),
    ];
    const fetch = vi.fn(async () => (responses.shift() ?? responses[0])?.() as Response);
    const source = neardataSource({
      baseUrl: "https://n.example",
      fetch,
      backoffMs: 1,
      minIntervalMs: 0,
    });
    await expect(source.finalHeight()).resolves.toBe(9);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("fails fast on client errors and gives up after the attempt limit", async () => {
    const notFound = neardataSource({
      baseUrl: "https://n.example",
      fetch: async () => json({}, 404),
    });
    await expect(notFound.block(1)).rejects.toThrow(NeardataError);
    const down = vi.fn(async () => json({}, 500));
    const source = neardataSource({
      baseUrl: "https://n.example",
      fetch: down,
      maxAttempts: 3,
      backoffMs: 1,
      minIntervalMs: 0,
    });
    await expect(source.finalHeight()).rejects.toThrow(/after 3 attempts/);
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("stops waiting and retrying once aborted", async () => {
    const controller = new AbortController();
    const source = neardataSource({
      baseUrl: "https://n.example",
      apiKey: "key",
      backoffMs: 60_000,
      signal: controller.signal,
      fetch: async () => json({}, 503),
    });
    const started = Date.now();
    const pending = source.finalHeight();
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow(/aborted/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
