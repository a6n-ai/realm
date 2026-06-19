import { generateCode, ValidationError } from "@tiffin/commons";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { hashPassword } from "@/lib/auth/password";
import { normalizeEmail } from "./users-contact";

const TEMP_PASSWORD = "Tiffin123";

export interface CreateOrderInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; phone: string; email?: string; addressLine: string; city: string; postalCode: string };
}

// The single authoritative order-creation path: prices server-side, provisions
// the customer by phone, and writes the order + simulated payment in one tx.
// Used by the public checkout and the agent (convert) flow alike.
export async function createOrder(input: CreateOrderInput, actorId?: string | null): Promise<{ deploymentId: string }> {
  const snapshot = await loadCatalogSnapshot();
  const pricing = priceSubscription(input.selections, buildPricingCatalog(snapshot, input.selections));

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!;
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const phone = input.contact.phone.trim();
  if (!phone) throw new ValidationError("Phone is required");
  const email = input.contact.email?.trim() ? normalizeEmail(input.contact.email) : null;

  const deploymentId = generateCode("SUB", 6);

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    let userId = existing?.id ?? null;
    if (!userId) {
      if (email) {
        const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (clash) throw new ValidationError("That email is already in use");
      }
      const passwordHash = await hashPassword(TEMP_PASSWORD);
      const inserted = await tx
        .insert(users)
        .values({ phone, email, name: input.contact.fullName, passwordHash, role: "user", createdBy: actorId ?? null })
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
        mealSizeId: input.selections.mealSizeId,
        frequencyId: frequency.id,
        dailyQty: input.selections.dailyQty,
        includeSaturday: input.selections.includeSaturday,
        includeSunday: input.selections.includeSunday,
        isStudent: input.selections.isStudent,
        durationWeeks: input.selections.durationWeeks,
        pricingSnapshot: pricing,
        weeklyFee: pricing.weeklyFee.toFixed(2),
        total: pricing.total.toFixed(2),
        status: zoneRow ? "active" : "waitlisted",
        deploymentId,
        zoneId: zoneRow?.id ?? null,
        fullName: input.contact.fullName,
        addressLine: input.contact.addressLine,
        city: input.contact.city,
        postalCode: input.contact.postalCode,
        createdBy: actorId ?? null,
      })
      .returning({ id: orders.id });

    await tx.insert(payments).values({
      orderId: order.id,
      status: "simulated_paid",
      amount: pricing.total.toFixed(2),
      createdBy: actorId ?? null,
    });
  });

  return { deploymentId };
}
