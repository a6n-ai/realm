import { normalizeProductName } from "@/lib/sync/clover-inventory-match";
import type { MenuSource, MenuSourceItem } from "@/lib/sync/menu-source";
import { rehostImage } from "@/lib/sync/rehost-image";
import { uniqueSlug } from "@/lib/products/slug";
import {
  productsRepository,
  type ProductRow,
  type ProductsRepository,
} from "@/lib/services/products.repository";

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
  // Items whose photo changed and was auto-rehosted to our storage this sync.
  imagesUpdated: { publicId: string; name: string }[];
  // Items whose name/description/price/category/availability were applied from
  // the source this sync. Only populated while Uber owns inventory, i.e. for
  // rows not linked to Clover — see diffAndFlag.
  fieldsUpdated: { publicId: string; name: string; changed: string[] }[];
  unchangedCount: number;
  // Uber items with no counterpart in our catalogue, skipped because Clover is
  // connected and owns which products exist. Reported, never silently dropped:
  // this is the list to check when something is on Uber Eats but not the site.
  skippedNotInClover: { name: string; rawCategory: string }[];
  duplicates: DuplicateCandidate[];
  categoryIssues: { rawCategory: string; items: string[] }[];
  errors: { item: string; message: string }[];
};

// Single definition shared with the Clover matcher — two copies of this rule would
// drift, and they have to agree on what counts as the same dish.
const normalizeName = normalizeProductName;

export type SyncOptions = {
  // Re-download + re-host every synced item's image even when its Uber Eats
  // source URL is unchanged. Use to migrate existing images onto new storage
  // (e.g. after pointing FILES_PUBLIC_BASE_URL at the CDN). Heavier: it re-fetches
  // every source photo. Off = only changed photos are re-hosted (the default).
  redownloadImages?: boolean;
  // Recompress re-hosted images to resized WebP (default). Off keeps the source
  // bytes as-is. See rehostImage.
  optimizeImages?: boolean;
  /**
   * When true, new Uber-only rows start OOS until linked to Clover (inventory SoT).
   * When false/omitted, force Uber-only rows active so the website is sellable —
   * Clover SoT OOS rules must not apply before a merchant is connected.
   * Temporary until Uber sync is replaced entirely.
   */
  cloverConnected?: boolean;
};

/**
 * Uber Eats catalogue sync.
 *
 * Scope depends on who owns inventory. With no Clover merchant connected, Uber
 * is the only catalogue there is, so it owns the full product record —
 * name, description, price, category and photo. Once a row is linked to Clover
 * (or a merchant is connected), Clover becomes the source of truth and Uber
 * contributes the photo only.
 *
 * All product persistence goes through {@link ProductsRepository} (DAO).
 * Orchestrated from ProductsService for HTTP routes.
 */
export class MenuSyncService {
  constructor(private readonly products: ProductsRepository) {}

  async run(source: MenuSource, opts: SyncOptions = {}): Promise<SyncResult> {
    const items = await source.fetchItems();
    const existingRows = await this.products.findAll();
    const cloverConnected = opts.cloverConnected ?? false;

    // Before Clover is connected, reactivate Uber-only OOS rows so the website
    // shows them available (not stuck inactive from Clover-linking bootstrap).
    // Temporary until Uber sync is replaced entirely.
    if (!cloverConnected) {
      for (const row of existingRows) {
        if (row.source === "uber_eats" && !row.cloverItemId && !row.active) {
          await this.products.updateByInternalId(row.id, { active: true });
          row.active = true;
        }
      }
    }

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
      imagesUpdated: [],
      fieldsUpdated: [],
      unchangedCount: 0,
      skippedNotInClover: [],
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
          await this.diffAndFlag(
            existing,
            item,
            result,
            opts.redownloadImages ?? false,
            opts.optimizeImages ?? true,
            cloverConnected,
          );
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

        // Clover owns which products exist. An Uber item that matched nothing
        // above is not ours to create — Uber's only remaining job is donating a
        // photo to a product Clover already put in the catalogue.
        if (cloverConnected) {
          result.skippedNotInClover.push({ name: item.name, rawCategory: item.rawCategory });
          continue;
        }

        const publicId = await this.createFromItem(
          item,
          takenSlugs,
          opts.optimizeImages ?? true,
          cloverConnected,
        );
        result.added.push({ publicId, name: item.name });
      } catch (e) {
        result.errors.push({ item: item.name, message: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    result.categoryIssues = Array.from(categoryIssueMap, ([rawCategory, list]) => ({
      rawCategory,
      items: list,
    }));
    return result;
  }

  private async createFromItem(
    item: MenuSourceItem,
    takenSlugs: Set<string>,
    optimize: boolean,
    cloverConnected: boolean,
  ): Promise<string> {
    // When Clover is connected, Uber bootstrap starts OOS until linked (inventory SoT).
    // Without a connected merchant, start active — do not apply Clover OOS or Uber
    // available flags (Uber is image-only; temporary until that sync is removed).
    const image = item.imageUrl
      ? await rehostImage(item.imageUrl, "catalog/products/synced", { optimize })
      : null;
    const slug = uniqueSlug(item.name, takenSlugs);
    takenSlugs.add(slug);

    const row = await this.products.create({
      name: item.name,
      description: item.description,
      category: item.category as string,
      price: item.price.toFixed(2),
      image,
      active: !cloverConnected,
      slug,
      source: "uber_eats",
      externalId: item.externalId,
      lastSyncedAt: Date.now(),
      syncStatus: "synced",
      lastSyncedImageUrl: item.imageUrl,
    });
    return row.publicId;
  }

  private async diffAndFlag(
    existing: ProductRow,
    item: MenuSourceItem,
    result: SyncResult,
    redownloadImages: boolean,
    optimize: boolean,
    cloverConnected: boolean,
  ): Promise<void> {
    // Who owns this row's inventory fields?
    //   Clover-linked, or Clover connected → Clover is SoT, Uber contributes the
    //     photo only. Never overwrite name/price/availability from Uber there.
    //   Otherwise → Uber is the only catalogue we have, so it owns everything.
    // Availability deliberately stays out of the Uber-owned set: run() has
    // already force-activated Uber-only rows so the site is sellable, and
    // writing Uber's `available` back would undo that on the same pass.
    const uberOwnsFields = !cloverConnected && !existing.cloverItemId;

    if (uberOwnsFields) {
      const changed: string[] = [];
      const patch: Record<string, unknown> = {};
      if (item.name !== existing.name) {
        patch.name = item.name;
        changed.push("name");
      }
      if ((item.description ?? null) !== (existing.description ?? null)) {
        patch.description = item.description;
        changed.push("description");
      }
      // price is numeric(10,2) → compare as a fixed string, not float.
      const incomingPrice = item.price.toFixed(2);
      if (incomingPrice !== String(existing.price)) {
        patch.price = incomingPrice;
        changed.push("price");
      }
      if (item.category && item.category !== existing.category) {
        patch.category = item.category;
        changed.push("category");
      }
      if (Object.keys(patch).length > 0) {
        await this.products.updateByInternalId(existing.id, patch);
        result.fieldsUpdated.push({
          publicId: existing.publicId,
          name: item.name,
          changed,
        });
      }
    }

    const urlChanged = (existing.lastSyncedImageUrl ?? null) !== (item.imageUrl ?? null);
    const imageChanged = urlChanged || (redownloadImages && !!item.imageUrl);

    if (imageChanged) {
      await this.products.updateByInternalId(existing.id, {
        image: item.imageUrl
          ? await rehostImage(item.imageUrl, "catalog/products/synced", { optimize })
          : null,
        lastSyncedImageUrl: item.imageUrl ?? null,
        lastSyncedAt: Date.now(),
        ...(existing.cloverItemId
          ? { pendingSync: null, syncStatus: "synced" as const }
          : { syncStatus: "synced" as const }),
      });
      result.imagesUpdated.push({ publicId: existing.publicId, name: existing.name });
      return;
    }

    await this.products.updateByInternalId(existing.id, {
      lastSyncedAt: Date.now(),
      ...(existing.cloverItemId
        ? { pendingSync: null, syncStatus: "synced" as const }
        : { syncStatus: "synced" as const }),
    });
    // Only "unchanged" if the field pass above didn't write anything either —
    // otherwise a name/price change with an unchanged photo would report as a
    // no-op sync.
    const wroteFields = result.fieldsUpdated.some((f) => f.publicId === existing.publicId);
    if (!wroteFields) result.unchangedCount++;
  }

  async resolveDuplicate(
    existingPublicId: string,
    action: "replace" | "keep" | "skip",
    incoming: MenuSourceItem,
    opts: { cloverConnected?: boolean } = {},
  ): Promise<void> {
    const cloverConnected = opts.cloverConnected ?? false;
    if (action === "skip") {
      // "Unrelated" means the Uber item is a genuinely different product. With
      // no Clover merchant, Uber is the only catalogue we have, so create it.
      // With Clover connected, Uber may not add products at all — the item is
      // simply not ours, and the admin adds it in Clover if they want it.
      if (cloverConnected) return;
      if (!incoming.category) return;
      const existingSlugs = new Set(await this.products.listSlugs());
      await this.createFromItem(incoming, existingSlugs, true, cloverConnected);
      return;
    }

    if (action === "keep") {
      // Link Uber external id for image sync only — do not overwrite inventory.
      await this.products.updateByPublicId(existingPublicId, {
        source: "uber_eats",
        externalId: incoming.externalId,
        syncStatus: "synced",
        lastSyncedAt: Date.now(),
      });
      return;
    }

    // replace: adopt the Uber photo onto the existing row. Name, price,
    // description and availability come too only while Uber is the only
    // catalogue we have — see cloverOwns below.
    const existing = await this.products.findByPublicId(existingPublicId);
    if (!existing) return;

    const image = incoming.imageUrl
      ? await rehostImage(incoming.imageUrl, "catalog/products/synced")
      : null;
    // Clover owns the record the moment a merchant is connected or the row is
    // linked. Uber contributes the photo and nothing else — description
    // included, which used to slip through on this path.
    const cloverOwns = cloverConnected || Boolean(existing.cloverItemId);
    await this.products.updateByPublicId(existingPublicId, {
      ...(cloverOwns
        ? {}
        : {
            name: incoming.name,
            price: incoming.price.toFixed(2),
            active: true,
            description: incoming.description,
          }),
      image,
      source: "uber_eats",
      externalId: incoming.externalId,
      syncStatus: "synced",
      lastSyncedAt: Date.now(),
      lastSyncedImageUrl: incoming.imageUrl,
      pendingSync: null,
    });
  }
}

export const menuSyncService = new MenuSyncService(productsRepository);
