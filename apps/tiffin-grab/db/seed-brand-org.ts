/**
 * One-off, idempotent seed: creates tiffin-grab's single brand-level organization
 * and backfills every existing orders row to it. Run once, after the Task 4/5
 * migrations are applied, before any franchise-level org is created. Mirrors
 * db/seed-admin.ts's shape.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/tiffin-grab/db/seed-brand-org.ts
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { orders, organization } from "./schema";

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

  const backfilled = await db
    .update(orders)
    .set({ organizationId: brandId })
    .where(isNull(orders.organizationId))
    .returning({ id: orders.id });

  console.log(`brand org: ${brandId}, backfilled ${backfilled.length} orders`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
