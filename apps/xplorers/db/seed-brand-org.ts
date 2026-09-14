/**
 * One-off, idempotent seed: creates Xplorers' brand-level organization and
 * backfills staff into its member list.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/xplorers/db/seed-brand-org.ts
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { Role } from "@foundry/commons";
import { db } from "./client";
import { app, member, organization, users } from "./schema";

const BRAND_CLIENT_CODE = "XP";

async function main() {
  const [existingBrand] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.clientCode, BRAND_CLIENT_CODE))
    .limit(1);

  const brandId =
    existingBrand?.id ??
    (
      await db
        .insert(organization)
        .values({
          name: "Xplorers",
          clientCode: BRAND_CLIENT_CODE,
          parentOrganizationId: null,
          isDefaultLocation: true,
        })
        .returning({ id: organization.id })
    )[0].id;

  const [appRow] = await db.select().from(app).limit(1);
  if (appRow) {
    await db
      .update(organization)
      .set({
        timezone: appRow.timezone,
        currency: appRow.currency,
        isDefaultLocation: true,
      })
      .where(eq(organization.id, brandId));
  }

  const staff = await db.select({ id: users.id }).from(users).where(ne(users.role, Role.USER));
  const alreadyMembers = staff.length
    ? await db
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.organizationId, brandId),
            inArray(
              member.userId,
              staff.map((s) => s.id),
            ),
          ),
        )
    : [];
  const alreadyMemberIds = new Set(alreadyMembers.map((m) => m.userId));
  const toBackfill = staff.filter((s) => !alreadyMemberIds.has(s.id));
  if (toBackfill.length) {
    await db.insert(member).values(toBackfill.map((s) => ({ organizationId: brandId, userId: s.id, role: "admin" })));
  }

  console.log(`brand org: ${brandId}, backfilled ${toBackfill.length} staff member rows`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
