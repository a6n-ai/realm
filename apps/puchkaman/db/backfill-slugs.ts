// One-off backfill: generate slugs for products created before the `slug`
// column existed. Safe to re-run — only touches rows where slug is null.
import { isNull } from "drizzle-orm";
import { db } from "./client";
import { products } from "./schema";
import { uniqueSlug } from "../lib/products/slug";
import { productsRepository } from "../lib/services/products.repository";

async function main() {
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(isNull(products.slug));
  const taken = new Set<string>();
  for (const row of rows) {
    const slug = uniqueSlug(row.name, taken);
    taken.add(slug);
    await productsRepository.updateByInternalId(row.id, { slug });
  }
  console.log(`backfilled ${rows.length} slugs`);
  process.exit(0);
}

main();
