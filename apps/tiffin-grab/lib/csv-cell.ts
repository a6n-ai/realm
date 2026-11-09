/** One CSV cell: formula starters are prefixed with ' so a spreadsheet never runs user text as a formula; quoted only when needed. */
export function csvCell(v: unknown): string {
  const raw = String(v ?? "");
  const t = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}
