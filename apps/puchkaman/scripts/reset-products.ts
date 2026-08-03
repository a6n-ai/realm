/**
 * One-time catalogue reset: delete every product so the next Clover pull
 * rebuilds the catalogue from the POS.
 *
 * DESTRUCTIVE. `order_items.product_id` is a plain FK, so removing a product
 * that has ever been ordered means removing its order lines too — that is
 * sales history, and it does not come back. The script therefore counts what
 * it is about to destroy, prints it, and refuses to act without --yes.
 *
 *   pnpm --filter puchkaman reset-products              # dry run, prints counts
 *   pnpm --filter puchkaman reset-products -- --yes     # actually deletes
 *
 * Runs in one transaction: either the whole catalogue goes or nothing does.
 * Afterwards, run the Clover pull from Settings → Clover (or Products → Sync).
 */
import postgres from "postgres";

const apply = process.argv.includes("--yes");

// Same rule as db/resolve-migration-url.ts: go direct, never through the
// transaction pooler. Inlined rather than imported — node --experimental-strip-types
// wants the .ts extension on the specifier and tsc rejects it.
function databaseUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  return url;
}

async function main() {
  const sql = postgres(databaseUrl(), { max: 1 });
  try {
    const [{ products }] = await sql<{ products: number }[]>`
      select count(*)::int as products from products`;
    const [{ orderLines, orders }] = await sql<{ orderLines: number; orders: number }[]>`
      select count(*)::int as "orderLines",
             count(distinct order_id)::int as orders
      from order_items`;
    const [{ categoryLinks }] = await sql<{ categoryLinks: number }[]>`
      select count(*)::int as "categoryLinks" from product_category_items`;
    const [{ modifierLinks }] = await sql<{ modifierLinks: number }[]>`
      select count(*)::int as "modifierLinks" from product_modifier_groups`;

    console.log(`products            ${products}`);
    console.log(`order line items    ${orderLines}  (across ${orders} orders)`);
    console.log(`category links      ${categoryLinks}`);
    console.log(`modifier links      ${modifierLinks}`);

    if (!apply) {
      console.log("\nDry run. Nothing deleted. Re-run with --yes to apply.");
      if (orderLines > 0) {
        console.log(
          `WARNING: applying will delete ${orderLines} order line item(s). ` +
            `Those orders keep their totals but lose their itemisation, permanently.`,
        );
      }
      return;
    }

    await sql.begin(async (tx) => {
      await tx`delete from order_items`;
      await tx`delete from product_category_items`;
      await tx`delete from product_modifier_groups`;
      await tx`delete from products`;
    });

    const [{ left }] = await sql<{ left: number }[]>`
      select count(*)::int as left from products`;
    console.log(`\nDeleted. products remaining: ${left}`);
    console.log("Next: run the Clover pull to rebuild the catalogue from the POS.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
