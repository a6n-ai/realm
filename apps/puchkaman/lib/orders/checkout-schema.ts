import { z } from "zod";

const cartLineSchema = z.object({
  productPublicId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const createCheckoutSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(40),
  contact: contactSchema,
});

export const payCheckoutSchema = z.object({
  orderPublicId: z.string().min(1),
  /** Tokenized card source from Clover iframe (`clv_…`). */
  source: z.string().min(1),
  clientIp: z.string().optional().nullable(),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type PayCheckoutInput = z.infer<typeof payCheckoutSchema>;
