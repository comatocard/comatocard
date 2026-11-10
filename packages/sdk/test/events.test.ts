import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_NAMES, parseEventLog } from "../src/events.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")
    .trim()
    .split("\n");

const allLines = [
  ...fixture("vault-events.jsonl"),
  ...fixture("registry-events.jsonl"),
  ...fixture("factory-events.jsonl"),
];

describe("golden fixtures emitted by the contracts", () => {
  it.each(allLines)("parses %s", (line) => {
    const result = parseEventLog(line);
    if (line.includes('"standard":"nep171"')) {
      expect(result).toEqual({ ok: false, reason: "other_standard" });
    } else {
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
  });

  it("covers every event the SDK knows", () => {
    const seen = new Set(
      allLines.flatMap((line) => {
        const result = parseEventLog(line);
        return result.ok ? [result.event.event] : [];
      }),
    );
    expect([...seen].sort()).toEqual([...EVENT_NAMES].sort());
  });

  it("narrows data by event name", () => {
    const line = fixture("vault-events.jsonl").find((l) => l.includes('"payment_rejected"'));
    const result = parseEventLog(line ?? "");
    if (!result.ok || result.event.event !== "payment_rejected") {
      throw new Error("expected payment_rejected");
    }
    expect(result.event.data.reason).toBe("per_tx_limit");
    expect(result.event.version).toBe("1.0.0");
  });
});

describe("parseEventLog", () => {
  const event = (body: unknown) => `EVENT_JSON:${JSON.stringify(body)}`;

  it("skips plain logs and other standards", () => {
    expect(parseEventLog("hello")).toEqual({ ok: false, reason: "not_an_event" });
    expect(
      parseEventLog(event({ standard: "nep141", version: "1.0.0", event: "ft_mint", data: [] })),
    ).toEqual({ ok: false, reason: "other_standard" });
  });

  it("reports malformed JSON", () => {
    expect(parseEventLog("EVENT_JSON:{")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects unknown events, unsupported versions and bad envelopes", () => {
    const base = { standard: "comatocard", version: "1.0.0" };
    expect(parseEventLog(event({ ...base, event: "nope", data: [{}] }))).toMatchObject({
      reason: "invalid",
      error: "unknown event nope",
    });
    expect(
      parseEventLog(event({ ...base, version: "2.0.0", event: "payment_expired", data: [{}] })),
    ).toMatchObject({ reason: "invalid", error: "unsupported version 2.0.0" });
    expect(
      parseEventLog(event({ ...base, event: "payment_expired", data: [{}, {}] })),
    ).toMatchObject({ reason: "invalid" });
  });

  it("rejects data that drifts from the schema", () => {
    const base = { standard: "comatocard", version: "1.0.0", event: "payment_expired" };
    expect(parseEventLog(event({ ...base, data: [{ payment_id: "7" }] }))).toMatchObject({
      reason: "invalid",
    });
    expect(parseEventLog(event({ ...base, data: [{ payment_id: 7, extra: true }] }))).toMatchObject(
      { reason: "invalid" },
    );
    expect(parseEventLog(event({ ...base, data: [{ payment_id: 7 }] }))).toMatchObject({
      ok: true,
    });
  });
});
