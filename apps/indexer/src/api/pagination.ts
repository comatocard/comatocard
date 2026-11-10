/** Opaque cursor over a numeric row id, so clients never depend on the encoding. */
export function encodeCursor(id: number): string {
  return Buffer.from(`p:${id}`).toString("base64url");
}

/** Returns the row id inside `cursor`, or `undefined` when it is not a cursor this API issued. */
export function decodeCursor(cursor: string): number | undefined {
  const decoded = Buffer.from(cursor, "base64url").toString();
  const match = /^p:(\d+)$/.exec(decoded);
  return match ? Number(match[1]) : undefined;
}
