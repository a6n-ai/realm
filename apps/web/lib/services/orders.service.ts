import { generateCode, ValidationError } from "@tiffin/commons";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { hashPassword } from "@/lib/auth/password";
import { isValidCaPhone, normalizeEmail } from "./users-contact";
import { validateOrderSlots } from "./order-slots";
import { validateStartDate } from "./start-date";

const TEMP_PASSWORD = "Tiffin123";

export interface CreateOrderInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; phone: string; email?: string; addressLine: string; city: string; postalCode: string };
}

export interface CreateOrderOptions {
  // Who performed the action — stamped as createdBy (the acting user's public_id).
  // For an agent order this is the staff member, NOT the order owner.
  actorId?: string | null;
  // The account the order belongs to (the owner's public_id). Set for a
  // logged-in customer's own checkout so the order attaches to their real
  // account regardless of the phone typed. Omitted for anonymous checkout and
  // agent orders, which resolve/provision the customer by phone.
  ownerUserId?: string | null;
}

// Resolve a user public_id (usr_…) to the internal bigint id. Returns null when
// the id is absent or doesn't match a user.
async function resolveUserId(
  tx: { select: typeof db.select },
  publicId: string | null | undefined,
): Promise<bigint | null> {
  if (!publicId) return null;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

// The single authoritative order-creation path: prices server-side, attaches the
// order to the owner (provisioning a customer by phone when none is given), and
// writes the order + simulated payment in one tx. Used by the public checkout
// and the agent (convert) flow alike.
//
// The client speaks public_id: input.selections.mealSizeId is a meal size
// public_id, and opts.actorId/ownerUserId are user public_ids. createOrder
// resolves each to the internal bigint id before writing the FK columns, and
// returns the order's public_id (ord_…) — never a bigint.
export async function createOrder(
  input: CreateOrderInput,
  opts: CreateOrderOptions = {},
): Promise<{ deploymentId: string; publicId: string }> {
  const { actorId = null, ownerUserId = null } = opts;
  const snapshot = await loadCatalogSnapshot();

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  validateOrderSlots(plan.planType, plan.offeredSlots, input.selections.mealSlots);
  validateStartDate(input.selections.startDate, plan.allowedStartDays, new Date());
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!
  const pricing = priceSubscription(input.selections, buildPricingCatalog(snapshot, input.selections));
  const mealSize = snapshot.mealSizes.find((m) => m.publicId === input.selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const phone = input.contact.phone.trim();
  if (!phone) throw new ValidationError("Phone is required");
  if (!isValidCaPhone(phone)) throw new ValidationError("Invalid phone number");
  const email = input.contact.email?.trim() ? normalizeEmail(input.contact.email) : null;

  const deploymentId = generateCode("SUB", 6);

  return db.transaction(async (tx) => {
    // Resolve the acting user and explicit owner public_ids to internal bigints.
    const createdBy = await resolveUserId(tx, actorId);
    const ownerId = await resolveUserId(tx, ownerUserId);

    // A logged-in customer's order attaches to their own account; anonymous and
    // agent orders resolve/provision the customer by phone.
    let userId = ownerId;
    if (!userId) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      userId = existing?.id ?? null;
    }
    if (!userId) {
      if (email) {
        const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (clash) throw new ValidationError("That email is already in use");
      }
      const passwordHash = await hashPassword(TEMP_PASSWORD);
      const inserted = await tx
        .insert(users)
        .values({ phone, email, name: input.contact.fullName, passwordHash, role: "user", createdBy })
        .onConflictDoNothing({ target: users.phone, where: sql`${users.phone} is not null` })
        .returning({ id: users.id });
      userId =
        inserted[0]?.id ??
        (await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1))[0].id;
    }

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        planId: plan.id,
        mealSizeId: mealSize.id,
        frequencyId: frequency.id,
        persons: input.selections.persons,
        mealSlots: input.selections.mealSlots,
        includeSaturday: input.selections.includeSaturday,
        includeSunday: input.selections.includeSunday,
        durationWeeks: input.selections.durationWeeks,
        startDate: input.selections.startDate,
        tiffinCount: pricing.tiffinCount,
        perTiffinPrice: pricing.perTiffinPrice.toFixed(2),
        pricingSnapshot: pricing,
        total: pricing.total.toFixed(2),
        status: zoneRow ? "active" : "waitlisted",
        deploymentId,
        zoneId: zoneRow?.id ?? null,
        fullName: input.contact.fullName,
        addressLine: input.contact.addressLine,
        city: input.contact.city,
        postalCode: input.contact.postalCode,
        createdBy,
      })
      .returning({ id: orders.id, publicId: orders.publicId });

    await tx.insert(payments).values({
      orderId: order.id,
      status: "simulated_paid",
      amount: pricing.total.toFixed(2),
      createdBy,
    });

    return { deploymentId, publicId: order.publicId };
  });
}
