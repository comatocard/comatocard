import { describe, expect, it } from "vitest";
import { groupByDay } from "../src/lib/payments";

const at = (iso: string) => ({ created_at: `${BigInt(Date.parse(iso)) * 1_000_000n}` });

describe("history grouped by day", () => {
  it("keeps the order and starts a group at each new day", () => {
    const rows = [
      at("2026-11-13T14:02:00Z"),
      at("2026-11-13T11:15:00Z"),
      at("2026-11-12T18:21:00Z"),
    ];
    const groups = groupByDay(rows, "UTC");
    expect(groups.map((g) => [g.day, g.rows.length])).toEqual([
      ["Nov 13", 2],
      ["Nov 12", 1],
    ]);
    expect(groups[0]?.rows[0]).toBe(rows[0]);
  });

  it("returns nothing for no rows", () => {
    expect(groupByDay([], "UTC")).toEqual([]);
  });
});
