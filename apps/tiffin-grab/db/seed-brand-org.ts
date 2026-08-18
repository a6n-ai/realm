/**
 * One-off, idempotent seed: creates tiffin-grab's single brand-level organization
 * and backfills every existing orders row to it. Run once, after the Task 4/5
 * migrations are applied, before any franchise-level org is created. Mirrors
 * db/seed-admin.ts's shape.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/tiffin-grab/db/seed-brand-org.ts
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { Role } from "@realm/commons";
import { db } from "./client";
import { orders, organization, member, users, app } from "./schema";

const BRAND_CLIENT_CODE = "TG";

async function main() {
  const [existing] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.clientCode, BRAND_CLIENT_CODE))
    .limit(1);

  const brandId =
    existing?.id ??
    (
      await db
        .insert(organization)
        .values({ name: "Tiffin Grab", clientCode: BRAND_CLIENT_CODE, parentOrganizationId: null })
        .returning({ id: organization.id })
    )[0].id;

  const [appRow] = await db.select().from(app).limit(1);
  if (appRow) {
    await db
      .update(organization)
      .set({
        timezone: appRow.timezone,
        cutoffHour: appRow.cutoffHour,
        defaultMaxPauses: appRow.defaultMaxPauses,
        defaultMaxPauseDaysTotal: appRow.defaultMaxPauseDaysTotal,
        defaultMaxPauseStretchDays: appRow.defaultMaxPauseStretchDays,
        currency: appRow.currency,
        defaultCountry: appRow.defaultCountry,
        leadAssignment: appRow.leadAssignment,
        mealTypes: appRow.mealTypes,
        discountPolicy: appRow.discountPolicy,
        paymentConfig: appRow.paymentConfig,
        integrationsConfig: appRow.integrationsConfig,
        maxWalletBalance: appRow.maxWalletBalance,
        isDefaultLocation: true,
      })
      .where(eq(organization.id, brandId));
  }

  const backfilled = await db
    .update(orders)
    .set({ organizationId: brandId })
    .where(isNull(orders.organizationId))
    .returning({ id: orders.id });

  // Every existing staff user (role != "user") must get a member row in the brand
  // org, or resolveSessionVisibleOrgIds returns [] for them post-deploy and the
  // now-live org scoping on orders hides everything. member.role is unused by any
  // access-control code today (createAccessControl checks users.role instead), so
  // "admin" is a fine bootstrap default here — a real per-org role model is a later
  // task if franchise-level roles are ever needed.
  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(ne(users.role, Role.USER));
  const alreadyMembers = staff.length
    ? await db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, brandId), inArray(member.userId, staff.map((s) => s.id))))
    : [];
  const alreadyMemberIds = new Set(alreadyMembers.map((m) => m.userId));
  const toBackfill = staff.filter((s) => !alreadyMemberIds.has(s.id));
  if (toBackfill.length) {
    await db.insert(member).values(toBackfill.map((s) => ({ organizationId: brandId, userId: s.id, role: "admin" })));
  }

  console.log(
    `brand org: ${brandId}, backfilled ${backfilled.length} orders, backfilled ${toBackfill.length} staff member rows, settings ${appRow ? "backfilled" : "skipped (no app row)"}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
