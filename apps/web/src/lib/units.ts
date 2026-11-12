/** Token amounts are integer strings in the smallest unit; these convert them for people. */

const DIGITS = /^\d+$/;

/** Removes trailing zeros from a fraction without a backtracking regular expression. */
function trimZeros(fraction: string): string {
  let end = fraction.length;
  while (end > 0 && fraction[end - 1] === "0") end -= 1;
  return fraction.slice(0, end);
}

/** `"1234567"` → `"1,234,567"`. */
function group(digits: string): string {
  const parts: string[] = [];
  for (let end = digits.length; end > 0; end -= 3)
    parts.unshift(digits.slice(Math.max(0, end - 3), end));
  return parts.join(",");
}

const withFraction = (whole: string, fraction: string) =>
  fraction ? `${whole}.${fraction}` : whole;

/** `"25000000"`, 6 decimals → `"25"`; `"1500000"` → `"1.5"`. Trailing zeros are dropped. */
export function formatUnits(raw: string | bigint, decimals: number): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const fraction = trimZeros((abs % base).toString().padStart(decimals, "0"));
  const sign = negative ? "-" : "";
  return sign + withFraction((abs / base).toString(), fraction);
}

/** `"1.5"`, 6 decimals → `"1500000"`. Returns null for anything that is not a plain amount. */
export function parseUnits(input: string, decimals: number): string | null {
  const [whole = "", fraction = "", ...rest] = input.trim().split(".");
  if (rest.length > 0 || !DIGITS.test(whole)) return null;
  if (fraction !== "" && !DIGITS.test(fraction)) return null;
  if (fraction.length > decimals) return null;
  const value =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return value.toString();
}

/** A display amount with grouping and at most `maxFraction` digits, for example `1,250.5`. */
export function displayUnits(raw: string | bigint, decimals: number, maxFraction = 2): string {
  const [whole = "0", fraction = ""] = formatUnits(raw, decimals).split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const sign = negative ? "-" : "";
  return sign + withFraction(group(digits), trimZeros(fraction.slice(0, maxFraction)));
}

/** Share of `part` in `total` as 0 to 1, for spend bars. A zero limit counts as full. */
export function ratio(part: string, total: string): number {
  const t = BigInt(total);
  if (t === 0n) return 1;
  const r = Number((BigInt(part) * 10_000n) / t) / 10_000;
  return Math.min(1, Math.max(0, r));
}
