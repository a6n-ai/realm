import { z } from "zod";

const reqNum = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), inner);

export const menuSectionInputSchema = z.object({
  categoryPublicId: z.string().trim().min(1),
  sortOrder: reqNum(z.coerce.number().int()),
});

export const menuSaveSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  active: z.boolean(),
  sortOrder: reqNum(z.coerce.number().int()),
  sections: z.array(menuSectionInputSchema),
  /** When true, push linked category sortOrder (and name) to Clover. */
  pushToClover: z.boolean().optional().default(false),
});

export type MenuSaveInput = z.infer<typeof menuSaveSchema>;
