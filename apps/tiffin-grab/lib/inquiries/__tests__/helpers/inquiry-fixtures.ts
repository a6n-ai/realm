import { inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, inquiries, inquiryActivities, leadSources, mealSizes, notificationOutbox, orders, plans, users } from "@/db/schema";

const rand = () => Math.random().toString(36).slice(2, 10);

export const testEmail = (tag = "fx") => `${tag}-${rand()}@test.invalid`;

export async function insertTestUser(input: { email?: string; phone?: string | null; name?: string } = {}) {
  const [u] = await db
    .insert(users)
    .values({ email: input.email ?? testEmail("user"), phone: input.phone ?? null, name: input.name ?? "Test Customer", role: "user" })
    .returning();
  return u;
}

export async function insertTestOrder(userId: bigint, input: { status?: "pending" | "active" | "paused" | "completed" | "cancelled" | "waitlisted"; startDate?: string; createdAt?: number; trialLength?: number | null } = {}) {
  const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  const [o] = await db
    .insert(orders)
    .values({
      userId,
      planId: plan!.id,
      mealSizeId: size!.id,
      frequencyId: freq!.id,
      durationWeeks: 1,
      startDate: input.startDate ?? "2035-01-01",
      tiffinCount: 5,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "50.00",
      deploymentId: `FX-${rand()}`,
      fullName: "Test Customer",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
      status: input.status ?? "active",
      trialLength: input.trialLength ?? null,
      ...(input.createdAt != null ? { createdAt: input.createdAt } : {}),
    })
    .returning();
  return o;
}

export async function sourceId(key = "website"): Promise<bigint> {
  const [s] = await db.select({ id: leadSources.id }).from(leadSources).where(inArray(leadSources.key, [key])).limit(1);
  return s!.id;
}

/** Inserts an inquiry row directly (no service side effects). */
export async function insertTestInquiry(values: Partial<typeof inquiries.$inferInsert> = {}) {
  const [row] = await db
    .insert(inquiries)
    .values({ fullName: "Fixture Lead", sourceId: await sourceId(), stage: "new", ...values })
    .returning();
  return row;
}

export async function resetInquiryData() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(notificationOutbox).where(like(notificationOutbox.dedupeKey, "inquiry_%"));
}
