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
 * Uber Eats image enrichment sync.
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
          await this.diffAndFlag(
            existing,
            item,
            result,
            opts.redownloadImages ?? false,
            opts.optimizeImages ?? true,
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
  ): Promise<void> {
    // Uber Eats is image enrichment only. Inventory (name/price/availability)
    // is owned by Clover when connected — never queue Uber name/price/description
    // as pending inventory updates, especially when the row is already Clover-linked.
    // Do not re-apply Uber `available` here: when Clover is disconnected the heal
    // above already forced Uber-only rows active; writing Uber OOS would undo that.
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
    result.unchangedCount++;
  }

  async resolveDuplicate(
    existingPublicId: string,
    action: "replace" | "keep" | "skip",
    incoming: MenuSourceItem,
    opts: { cloverConnected?: boolean } = {},
  ): Promise<void> {
    const cloverConnected = opts.cloverConnected ?? false;
    if (action === "skip") {
      // "Unrelated" means exactly that — the Uber Eats item is a genuinely
      // different product and gets created on its own, not silently dropped.
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

    // replace: adopt Uber image (+ description) onto the existing row.
    // When Clover-linked, leave name/price/active alone — Clover is inventory SoT.
    const existing = await this.products.findByPublicId(existingPublicId);
    if (!existing) return;

    const image = incoming.imageUrl
      ? await rehostImage(incoming.imageUrl, "catalog/products/synced")
      : null;
    const cloverLinked = Boolean(existing.cloverItemId);
    await this.products.updateByPublicId(existingPublicId, {
      ...(cloverLinked
        ? {}
        : {
            name: incoming.name,
            price: incoming.price.toFixed(2),
            // Clover connected + unlinked → OOS until linked; otherwise active for website.
            active: !cloverConnected,
          }),
      description: incoming.description,
      image,
      source: "uber_eats",
      externalId: incoming.externalId,
      syncStatus: "synced",
      lastSyncedAt: Date.now(),
      lastSyncedImageUrl: incoming.imageUrl,
      pendingSync: null,
    });
  }

  async applyPending(
    productId: string,
    action:
      | "apply_name"
      | "apply_description"
      | "apply_price"
      | "apply_image"
      | "apply_all"
      | "ignore",
  ): Promise<void> {
    const row = await this.products.findByPublicId(productId);
    if (!row?.pendingSync) return;
    const pending = row.pendingSync;

    if (action === "ignore") {
      await this.products.updateByInternalId(row.id, {
        pendingSync: null,
        syncStatus: "synced",
      });
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
      patch.image = pending.imageUrl
        ? await rehostImage(pending.imageUrl, "catalog/products/synced")
        : null;
      patch.lastSyncedImageUrl = pending.imageUrl ?? null;
    }

    const remaining: Record<string, unknown> = { ...pending };
    if (wantsName) delete remaining.name;
    if (wantsDescription) delete remaining.description;
    if (wantsPrice) delete remaining.price;
    if (wantsImage) delete remaining.imageUrl;
    const stillPending = Object.keys(remaining).some((k) => k !== "fetchedAt");

    await this.products.updateByInternalId(row.id, {
      ...patch,
      pendingSync: stillPending ? remaining : null,
      syncStatus: stillPending ? "update_available" : "synced",
    });
  }
}

export const menuSyncService = new MenuSyncService(productsRepository);
