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

// Zone (radius/fee/discount/scheduling) is derived server-side from a fresh
// resolveAddress() geocode, not asserted by the client — see
// orders.service.ts createCheckout(). `.strict()` on the delivery branch is
// load-bearing: it rejects a client-supplied `lat`/`lng`, which is the only
// thing standing between "distance decides the discount" and "post a point
// next to the shop for 15% off".
const fulfillmentSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("pickup") }),
    z
      .object({
        type: z.literal("delivery"),
        /** Which delivery type the customer picked — re-verified server-side against
         * availableTypes() at the resolved distance, never trusted for price/eligibility. */
        deliveryTypeKey: z.string().trim().min(1),
        address: z.string().trim().min(5).max(300),
        /** Places id — preferred resolution path in resolveAddress(). */
        placeId: z.string().trim().min(1).optional(),
        /** Required once the server determines the type requires scheduling. */
        scheduledFor: z.string().datetime().optional(),
      })
      .strict(),
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
  /**
   * Which delivery option the customer has picked, so the quoted total includes
   * its discount instead of showing a total higher than what gets charged. Only
   * the KEY crosses the wire — the server reads the percentage from the
   * database, exactly as order creation does. Eligibility for that key is not
   * re-checked here (it would cost a geocode per keystroke); createCheckout
   * re-derives everything before any money moves, so a spoofed key only ever
   * misleads the person sending it.
   */
  deliveryTypeKey: z.string().min(1).max(64).optional().nullable(),
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
