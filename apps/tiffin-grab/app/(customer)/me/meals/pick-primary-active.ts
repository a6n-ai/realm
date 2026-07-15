type StatusRow = { status: string; [key: string]: unknown };

/** First `status === "active"` row, or `null` — orders are already ordered by `createdAt desc`. */
export function pickPrimaryActive(rows: StatusRow[]): StatusRow | null {
  return rows.find((r) => r.status === "active") ?? null;
}
