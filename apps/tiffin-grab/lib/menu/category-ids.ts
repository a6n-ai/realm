// menu_items and meal_selections store a category_id foreign key, but everything above the
// service — the builder's working copy, the poster, the meal grid, the customer picker —
// speaks in category keys ("sabzi", "rice"). Keys are stable, readable and already on the
// wire, so the translation lives here at the storage boundary rather than rippling upward.
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";

/** key → row id, for writes. */
export async function categoryIdsByKey(): Promise<Map<string, bigint>> {
  const rows = await db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories);
  return new Map(rows.map((r) => [r.key, r.id]));
}

/** Resolve the keys a write is about, failing on the first one that names no category. */
export async function requireCategoryIds(keys: Iterable<string>): Promise<Map<string, bigint>> {
  const byKey = await categoryIdsByKey();
  for (const key of keys) {
    if (!byKey.has(key)) throw new ValidationError(`Category "${key}" does not exist`);
  }
  return byKey;
}
