/** Formats a nanosecond timestamp as an ISO 8601 UTC string. */
export function isoFromNanos(nanos: string): string {
  return new Date(Number(BigInt(nanos) / 1_000_000n)).toISOString();
}

/** Formats an integer amount in the token's smallest unit as a decimal string. */
export function formatUnits(amount: string, decimals: number): string {
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function escapeCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Prefix formula triggers so spreadsheets show the value instead of evaluating it.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** RFC 4180 CSV with a header row and CRLF line endings. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return `${[header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}
