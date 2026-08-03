import { z } from "zod";

/** Hex colour as Clover Register stores it, e.g. #FF0080. Blank clears it. */
const colorCode = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #FF0080")
  .nullable()
  .or(z.literal("").transform(() => null));

export const categoryEditSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  colorCode: colorCode.optional().default(null),
  active: z.boolean(),
});
export type CategoryEditInput = z.infer<typeof categoryEditSchema>;

/**
 * minRequired/maxAllowed are Clover's selection rules. Both optional — Clover
 * treats absent as "no constraint" — but a max below a min is never what anyone
 * meant, so it is rejected here rather than pushed to the POS.
 */
export const modifierGroupEditSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    alternateName: z.string().trim().max(120).nullable().optional().default(null),
    minRequired: z.coerce.number().int().min(0).max(99).nullable().optional().default(null),
    maxAllowed: z.coerce.number().int().min(0).max(99).nullable().optional().default(null),
    showByDefault: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(9999),
    active: z.boolean(),
  })
  .refine(
    (v) => v.minRequired == null || v.maxAllowed == null || v.maxAllowed >= v.minRequired,
    { message: "Max allowed cannot be lower than min required", path: ["maxAllowed"] },
  );
export type ModifierGroupEditInput = z.infer<typeof modifierGroupEditSchema>;
