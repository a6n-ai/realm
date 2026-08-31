// Copied verbatim from @relay/email rather than imported: depending on that
// package would invert the layering that lets @relay/sms and @relay/whatsapp
// land as siblings later. tiffin-grab's stored templates depend on this exact
// missing-variable and stringification behaviour — do not "improve" it.
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
