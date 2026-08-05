import { z } from "zod";
import { phoneSchema } from "@realm/commons";

const cartLineSchema = z.object({
  productPublicId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  /**
   * Clover modifier ids only. Prices are never accepted from the browser — the
   * server re-reads each modifier's amount, which is also what gets sent to Clover
   * (it does not look modifier prices up itself).
   */
  modifiers: z.array(z.string().min(1)).max(20).default([]),
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  // Required: the kitchen calls the customer when a pickup order stalls, and
  // couriers need it for delivery. Stored E.164 so the country code survives
  // whatever the browser sent (a bare "416…" is assumed Canadian).
  phone: phoneSchema("CA"),
  note: z.string().trim().max(500).optional().nullable(),
});

// Instant vs. scheduled delivery is derived server-side from a fresh geocode of
// `address`, not asserted by the client — see orders.service.ts createCheckout().
const fulfillmentSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("pickup") }),
    z.object({
      type: z.literal("delivery"),
      address: z.string().trim().min(5).max(300),
      /** Required once the server determines the address is outside the instant radius. */
      scheduledFor: z.string().datetime().optional(),
    }),
  ])
  .default({ type: "pickup" });

/**
 * Ids and a typed code only. The amount is always re-derived server-side from
 * the synced Clover discount — see lib/orders/discounts.ts.
 */
const discountRequestSchema = z
  .object({
    offerPublicIds: z.array(z.string().min(1)).max(5).default([]),
    code: z.string().trim().max(40).optional().nullable(),
  })
  .default({ offerPublicIds: [] });

export const createCheckoutSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(40),
  contact: contactSchema,
  fulfillment: fulfillmentSchema,
  discounts: discountRequestSchema,
});

/** Live bag pricing. Same lines as a real checkout, no contact or fulfillment yet. */
export const quoteCartSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(40),
  discounts: discountRequestSchema,
});

export const payCheckoutSchema = z.object({
  orderPublicId: z.string().min(1),
  /** Tokenized card source from Clover iframe (`clv_…`). */
  source: z.string().min(1),
  clientIp: z.string().optional().nullable(),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type QuoteCartInput = z.infer<typeof quoteCartSchema>;
export type PayCheckoutInput = z.infer<typeof payCheckoutSchema>;
