type PgErr = { code?: string; constraint?: string; constraint_name?: string; message?: string; cause?: PgErr };

/** drizzle wraps the driver error, so the PostgresError (code + constraint_name) sits on .cause, up to two levels down. */
export const pgErrorLayers = (e: unknown): PgErr[] => {
  const err = e as PgErr | null | undefined;
  return [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
};

/** A Postgres unique violation (23505), optionally only on a constraint whose name matches (substring, or regex). */
export function isUniqueViolation(e: unknown, constraint?: string | RegExp | readonly string[]): boolean {
  return pgErrorLayers(e).some((l) => {
    if (l.code !== "23505") return false;
    if (constraint == null) return true;
    const name = l.constraint ?? l.constraint_name ?? "";
    if (typeof constraint === "string") return name.includes(constraint);
    if (constraint instanceof RegExp) return constraint.test(name);
    return constraint.some((c) => name.includes(c));
  });
}
