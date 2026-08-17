import { z } from "zod";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { carts } from "@/db/schema";
import { CART_MAX_LINES, CART_MAX_MODIFIERS, CART_MAX_QTY, type CartItem } from "@/lib/cart/types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const modifierSchema = z.object({
  cloverModifierId: z.string().min(1).max(64),
  name: z.string().max(120).default(""),
  price: z.number().nonnegative().max(10_000),
});

/**
 * A cart row is customer-controlled input. It is never trusted at checkout —
 * createCheckout re-reads products and re-prices through Clover — but it must
 * not become a place to park arbitrary JSON, so the same caps the client
 * enforces are enforced again here.
 */
export const cartItemsSchema = z
  .array(
    z.object({
      productPublicId: z.string().min(1).max(64),
      name: z.string().max(200).default(""),
      price: z.number().nonnegative().max(100_000),
      category: z.string().max(120).default(""),
      quantity: z.number().int().positive().max(CART_MAX_QTY),
      modifiers: z.array(modifierSchema).max(CART_MAX_MODIFIERS).default([]),
    }),
  )
  .max(CART_MAX_LINES) as unknown as z.ZodType<CartItem[]>;

/**
 * Upsert by publicId. An unknown publicId mints a new cart rather than being
 * trusted: the id arrives from a cookie, and honouring an arbitrary one would
 * let a caller choose their own row id.
 *
 * `email` is sticky — a later null never clears a known address, because the
 * client mirrors on every cart mutation and most of those happen before the
 * contact step has anything to send.
 */
export async function upsertCart(input: {
  publicId: string | null;
  items: CartItem[];
  userId: bigint | null;
  email: string | null;
}): Promise<{ publicId: string }> {
  const email = input.email ? input.email.trim().toLowerCase() : null;
  const now = Date.now();

  if (input.publicId) {
    const [existing] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.publicId, input.publicId))
      .limit(1);
    if (existing) {
      await db
        .update(carts)
        .set({
          items: input.items,
          lastActivityAt: now,
          ...(email ? { email } : {}),
          ...(input.userId ? { userId: input.userId } : {}),
        })
        .where(eq(carts.id, existing.id));
      return { publicId: input.publicId };
    }
  }

  const [row] = await db
    .insert(carts)
    .values({
      items: input.items,
      userId: input.userId,
      email,
      lastActivityAt: now,
      createdBy: input.userId,
    })
    .returning({ publicId: carts.publicId });
  return { publicId: row.publicId };
}

/** Read a cart's owner so a route can refuse a cookie pointing at someone else's row. */
export async function cartOwner(publicId: string): Promise<{ userId: bigint | null } | null> {
  const [row] = await db
    .select({ userId: carts.userId })
    .from(carts)
    .where(eq(carts.publicId, publicId))
    .limit(1);
  return row ?? null;
}

/** Stamp conversion inside the order transaction, so a rolled-back order leaves the cart live. */
export async function markCartConverted(tx: Tx, publicId: string, orderId: bigint): Promise<void> {
  await tx
    .update(carts)
    .set({ convertedOrderId: orderId })
    .where(and(eq(carts.publicId, publicId), isNull(carts.convertedOrderId)));
}

/** Retention: a row holding a stranger's email and shopping habits is not kept indefinitely. */
export async function purgeStaleCarts(before: number): Promise<number> {
  const deleted = await db
    .delete(carts)
    .where(lt(carts.lastActivityAt, before))
    .returning({ id: carts.id });
  return deleted.length;
}
