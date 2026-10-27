import type { z } from "zod";

/**
 * Parse an edit patch: only the keys the caller sent survive. zod 4's `.partial()` still fills `.default()`s for
 * absent keys, so a restore (`{ active: true }`) would otherwise write `items: []` / `allowedDays: []` over the row.
 * A schema with a trailing transform (delivery frequencies) is a pipe with no `.partial()`: patch its input object,
 * then run the transform over what was sent.
 */
export function parsePatch(schema: z.ZodType, patch: Record<string, unknown>): Record<string, unknown> {
  const pipe = schema as unknown as { in?: z.ZodObject<z.ZodRawShape>; out?: z.ZodType };
  const object = (typeof (schema as z.ZodObject<z.ZodRawShape>).partial === "function" ? schema : pipe.in) as z.ZodObject<z.ZodRawShape>;
  const parsed = object.partial().parse(patch) as Record<string, unknown>;
  const sent = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in patch));
  if (object === schema || !pipe.out) return sent;
  const out = pipe.out.parse(sent) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}
