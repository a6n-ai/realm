const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Replace {{a.b}} with the resolved value from `vars`; missing → "". */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(VAR_RE, (_m, path: string) => {
    const value = path.split(".").reduce<unknown>(
      (acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      vars,
    );
    return value == null ? "" : String(value);
  });
}
