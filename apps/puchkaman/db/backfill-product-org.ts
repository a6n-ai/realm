/**
 * One-off, idempotent backfill: sets `products.organization_id` to the
 * Toronto franchise org (clientCode "PK-TOR", seeded by seed-brand-org.ts)
 * on every product row that is currently null.
 *
 * Every product synced so far came from Toronto's Clover connection, from
 * before per-franchise scoping existed — they're null, and
 * productsService.listForPublicMenu treats a null organizationId as
 * "shared across every location", so they leak onto every other franchise's
 * public menu (e.g. Vancouver, which has no products of its own yet). This
 * backfill makes that null-fallback mean what it's supposed to mean going
 * forward: a deliberately shared product, not an untagged one.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/puchkaman/db/backfill-product-org.ts
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { organization, products } from "./schema";

const TORONTO_CLIENT_CODE = "PK-TOR";

async function main() {
  const [toronto] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.clientCode, TORONTO_CLIENT_CODE))
    .limit(1);

  if (!toronto) {
    throw new Error(
      `No organization with clientCode "${TORONTO_CLIENT_CODE}" — check the actual franchise clientCode before backfilling.`,
    );
  }

  const result = await db
    .update(products)
    .set({ organizationId: toronto.id })
    .where(isNull(products.organizationId))
    .returning({ id: products.id });

  console.log(`Backfilled ${result.length} product(s) to organization ${toronto.id} (${TORONTO_CLIENT_CODE}).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
