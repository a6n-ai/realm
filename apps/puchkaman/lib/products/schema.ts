import { z } from "zod";
import { CATEGORY_IDS } from "@/lib/menu-categories";

// Stored image is the full FileDetail JSON; url is what the UI needs. Extra keys pass through.
const fileDetail = z
  .object({ url: z.string().min(1) })
  .passthrough()
  .nullable()
  .optional();

// Form number inputs serialize blanks as "" — z.coerce.number() turns "" into 0
// before .optional()/.nullable() are consulted, so a blank price would silently
// become 0. Preprocess the blank away first so it round-trips as an error/absent.
const reqNum = <T extends z.ZodTypeAny>(inner: T) => z.preprocess((v) => (v === "" ? undefined : v), inner);

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional().nullable(),
  category: z.enum(CATEGORY_IDS as [string, ...string[]]),
  price: reqNum(z.coerce.number().nonnegative("Price must be 0 or more")),
  image: fileDetail,
  tags: z.array(z.enum(["best", "viral", "new"])).optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  displayOrder: reqNum(z.coerce.number().int()).optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;
