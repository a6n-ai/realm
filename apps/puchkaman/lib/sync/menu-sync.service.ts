import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { uniqueSlug } from "@/lib/products/slug";
import type { MenuSource, MenuSourceItem } from "@/lib/sync/menu-source";
import { rehostImage } from "@/lib/sync/rehost-image";

type ProductRow = typeof products.$inferSelect;

export type DuplicateCandidate = {
  existingPublicId: string;
  existingName: string;
  existingPrice: number;
  existingImageUrl: string | null;
  existingActive: boolean;
  incoming: MenuSourceItem;
};

export type SyncResult = {
  added: { publicId: string; name: string }[];
  updatesAvailable: { publicId: string; name: string }[];
  // Items whose photo changed and was auto-rehosted to our storage this sync
  // (applied immediately, unlike text/price which wait in updatesAvailable).
  imagesUpdated: { publicId: string; name: string }[];
  unchangedCount: number;
  duplicates: DuplicateCandidate[];
  categoryIssues: { rawCategory: string; items: string[] }[];
  errors: { item: string; message: string }[];
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

const PRICE_EPSILON = 0.005;

export class MenuSyncService {
  async run(source: MenuSource): Promise<SyncResult> {
    const items = await source.fetchItems();
    const existingRows = await db.select().from(products);

    const byExternalId = new Map<string, ProductRow>();
    for (const row of existingRows) {
      if (row.source === "uber_eats" && row.externalId) byExternalId.set(row.externalId, row);
    }
    // Only unlinked rows are candidates for the "looks like a duplicate" flow —
    // a row already tracking some other externalId can't also be this item.
    const unlinkedByKey = new Map<string, ProductRow>();
    for (const row of existingRows) {
      if (row.source === "uber_eats" && row.externalId) continue;
      unlinkedByKey.set(`${normalizeName(row.name)}::${row.category}`, row);
    }

    const takenSlugs = new Set(existingRows.map((r) => r.slug).filter((s): s is string => !!s));

    const result: SyncResult = {
      added: [],
      updatesAvailable: [],
      imagesUpdated: [],
      unchangedCount: 0,
      duplicates: [],
      categoryIssues: [],
      errors: [],
    };
    const categoryIssueMap = new Map<string, string[]>();

    for (const item of items) {
      try {
        if (!item.category) {
          const list = categoryIssueMap.get(item.rawCategory) ?? [];
          list.push(item.name);
          categoryIssueMap.set(item.rawCategory, list);
          continue;
        }

        const existing = byExternalId.get(item.externalId);
        if (existing) {
          await this.diffAndFlag(existing, item, result);
          continue;
        }

        const dupKey = `${normalizeName(item.name)}::${item.category}`;
        const duplicate = unlinkedByKey.get(dupKey);
        if (duplicate) {
          result.duplicates.push({
            existingPublicId: duplicate.publicId,
            existingName: duplicate.name,
            existingPrice: Number(duplicate.price),
            existingImageUrl: duplicate.image?.url ?? null,
            existingActive: duplicate.active,
            incoming: item,
          });
          continue;
        }

        const publicId = await this.createFromItem(item, takenSlugs);
        result.added.push({ publicId, name: item.name });
      } catch (e) {
        result.errors.push({ item: item.name, message: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    result.categoryIssues = Array.from(categoryIssueMap, ([rawCategory, list]) => ({ rawCategory, items: list }));
    return result;
  }

  private async createFromItem(item: MenuSourceItem, takenSlugs: Set<string>): Promise<string> {
    const image = item.imageUrl ? await rehostImage(item.imageUrl, "catalog/products/synced") : null;
    const slug = uniqueSlug(item.name, takenSlugs);
    takenSlugs.add(slug);

    const [row] = await db
      .insert(products)
      .values({
        name: item.name,
        description: item.description,
        category: item.category as string,
        price: item.price.toFixed(2),
        image,
        active: item.available,
        slug,
        source: "uber_eats",
        externalId: item.externalId,
        lastSyncedAt: Date.now(),
        syncStatus: "synced",
        lastSyncedImageUrl: item.imageUrl,
      })
      .returning({ publicId: products.publicId });
    return row.publicId;
  }

  private async diffAndFlag(existing: ProductRow, item: MenuSourceItem, result: SyncResult): Promise<void> {
    // Image changes auto-persist to our storage on every sync (no manual Apply)
    // so the public site never renders a volatile Uber Eats source URL. Text and
    // price diffs still queue in pendingSync for admin approval below.
    const imageChanged = (existing.lastSyncedImageUrl ?? null) !== (item.imageUrl ?? null);
    const imagePatch: Record<string, unknown> = {};
    if (imageChanged) {
      imagePatch.image = item.imageUrl ? await rehostImage(item.imageUrl, "catalog/products/synced") : null;
      imagePatch.lastSyncedImageUrl = item.imageUrl ?? null;
      result.imagesUpdated.push({ publicId: existing.publicId, name: existing.name });
    }

    const pending: Record<string, unknown> = {};
    if (existing.name !== item.name) pending.name = item.name;
    if ((existing.description ?? null) !== (item.description ?? null)) pending.description = item.description;
    if (Math.abs(Number(existing.price) - item.price) > PRICE_EPSILON) pending.price = item.price;

    if (Object.keys(pending).length === 0) {
      await db.update(products).set({ ...imagePatch, lastSyncedAt: Date.now(), syncStatus: "synced" }).where(eq(products.id, existing.id));
      if (!imageChanged) result.unchangedCount++;
      return;
    }

    await db
      .update(products)
      .set({
        ...imagePatch,
        pendingSync: { ...pending, fetchedAt: new Date().toISOString() },
        syncStatus: "update_available",
        lastSyncedAt: Date.now(),
      })
      .where(eq(products.id, existing.id));
    result.updatesAvailable.push({ publicId: existing.publicId, name: existing.name });
  }

  // Duplicate resolution — called from the review dialog once the admin
  // picks Replace / Keep / Skip for a name+category match found during run().
  async resolveDuplicate(
    existingPublicId: string,
    action: "replace" | "keep" | "skip",
    incoming: MenuSourceItem,
  ): Promise<void> {
    if (action === "skip") {
      // "Unrelated" means exactly that — the Uber Eats item is a genuinely
      // different product and gets created on its own, not silently dropped.
      if (!incoming.category) return;
      const existingSlugs = new Set(
        (await db.select({ slug: products.slug }).from(products)).map((r) => r.slug).filter((s): s is string => !!s),
      );
      await this.createFromItem(incoming, existingSlugs);
      return;
    }

    if (action === "keep") {
      await db
        .update(products)
        .set({ source: "uber_eats", externalId: incoming.externalId, syncStatus: "synced", lastSyncedAt: Date.now() })
        .where(eq(products.publicId, existingPublicId));
      return;
    }

    // replace: adopt the incoming item's data onto the existing row.
    const image = incoming.imageUrl ? await rehostImage(incoming.imageUrl, "catalog/products/synced") : null;
    await db
      .update(products)
      .set({
        name: incoming.name,
        description: incoming.description,
        price: incoming.price.toFixed(2),
        image,
        active: incoming.available,
        source: "uber_eats",
        externalId: incoming.externalId,
        syncStatus: "synced",
        lastSyncedAt: Date.now(),
        lastSyncedImageUrl: incoming.imageUrl,
        pendingSync: null,
      })
      .where(eq(products.publicId, existingPublicId));
  }

  // Applies some or all of a product's pendingSync candidate onto the live
  // row — the only place pendingSync values ever become real column values.
  async applyPending(
    productId: string,
    action: "apply_name" | "apply_description" | "apply_price" | "apply_image" | "apply_all" | "ignore",
  ): Promise<void> {
    const [row] = await db.select().from(products).where(eq(products.publicId, productId)).limit(1);
    if (!row?.pendingSync) return;
    const pending = row.pendingSync;

    if (action === "ignore") {
      await db.update(products).set({ pendingSync: null, syncStatus: "synced" }).where(eq(products.id, row.id));
      return;
    }

    const patch: Record<string, unknown> = {};
    const wantsName = action === "apply_name" || action === "apply_all";
    const wantsDescription = action === "apply_description" || action === "apply_all";
    const wantsPrice = action === "apply_price" || action === "apply_all";
    const wantsImage = action === "apply_image" || action === "apply_all";

    if (wantsName && pending.name !== undefined) patch.name = pending.name;
    if (wantsDescription && "description" in pending) patch.description = pending.description;
    if (wantsPrice && pending.price !== undefined) patch.price = pending.price.toFixed(2);
    if (wantsImage && "imageUrl" in pending) {
      patch.image = pending.imageUrl ? await rehostImage(pending.imageUrl, "catalog/products/synced") : null;
      patch.lastSyncedImageUrl = pending.imageUrl ?? null;
    }

    // Clear only the fields being applied from pendingSync; leave the rest
    // (e.g. applying just the image keeps a pending price change queued).
    const remaining: Record<string, unknown> = { ...pending };
    if (wantsName) delete remaining.name;
    if (wantsDescription) delete remaining.description;
    if (wantsPrice) delete remaining.price;
    if (wantsImage) delete remaining.imageUrl;
    const stillPending = Object.keys(remaining).some((k) => k !== "fetchedAt");

    await db
      .update(products)
      .set({
        ...patch,
        pendingSync: stillPending ? (remaining as never) : null,
        syncStatus: stillPending ? "update_available" : "synced",
      })
      .where(eq(products.id, row.id));
  }
}

export const menuSyncService = new MenuSyncService();
