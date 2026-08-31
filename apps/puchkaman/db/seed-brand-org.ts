/**
 * One-off, idempotent seed: creates puchkaman's brand-level organization and
 * two franchise-level organizations (Vancouver, Toronto), backfilling settings
 * from the existing single `app` row onto the brand org, and staff into the
 * brand org's member list.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/puchkaman/db/seed-brand-org.ts
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { Role } from "@foundry/commons";
import { db } from "./client";
import { app, member, organization, users } from "./schema";

const BRAND_CLIENT_CODE = "PK";
const FRANCHISES = [
  { clientCode: "PK-VAN", name: "Puchkaman Vancouver" },
  { clientCode: "PK-TOR", name: "Puchkaman Toronto" },
];

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
          name: "Puchkaman",
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
        integrationsConfig: appRow.integrationsConfig,
        storeLat: appRow.storeLat,
        storeLng: appRow.storeLng,
        isDefaultLocation: true,
      })
      .where(eq(organization.id, brandId));
  }

  const franchiseIds: string[] = [];
  for (const f of FRANCHISES) {
    const [existing] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.clientCode, f.clientCode))
      .limit(1);
    const id =
      existing?.id ??
      (
        await db
          .insert(organization)
          .values({ name: f.name, clientCode: f.clientCode, parentOrganizationId: brandId })
          .returning({ id: organization.id })
      )[0].id;
    franchiseIds.push(id);
  }

  // Customers (Role.USER) hold no member row by design; every other role is staff.
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

  console.log(
    `brand org: ${brandId}, franchises: ${franchiseIds.join(", ")}, backfilled ${toBackfill.length} staff member rows`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
