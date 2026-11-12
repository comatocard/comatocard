import { describe, expect, it } from "vitest";
import { displayUnits, formatUnits, parseUnits, ratio } from "../src/lib/units";

describe("token units", () => {
  it("formats raw amounts without trailing zeros", () => {
    expect(formatUnits("25000000", 6)).toBe("25");
    expect(formatUnits("1500000", 6)).toBe("1.5");
    expect(formatUnits("1", 6)).toBe("0.000001");
    expect(formatUnits(0n, 6)).toBe("0");
  });

  it("parses decimal input and refuses what is not an amount", () => {
    expect(parseUnits("1.5", 6)).toBe("1500000");
    expect(parseUnits(" 20 ", 6)).toBe("20000000");
    expect(parseUnits("0.0000001", 6)).toBeNull();
    expect(parseUnits("-1", 6)).toBeNull();
    expect(parseUnits("1e3", 6)).toBeNull();
    expect(parseUnits("", 6)).toBeNull();
  });

  it("groups thousands and caps the fraction for display", () => {
    expect(displayUnits("1250500000", 6)).toBe("1,250.5");
    expect(displayUnits("1234567", 6, 2)).toBe("1.23");
  });

  it("bounds a spend ratio and treats a zero limit as full", () => {
    expect(ratio("5", "10")).toBe(0.5);
    expect(ratio("20", "10")).toBe(1);
    expect(ratio("1", "0")).toBe(1);
  });
});
