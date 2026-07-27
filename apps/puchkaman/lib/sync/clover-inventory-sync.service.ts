import {
  cloverCentsToDollars,
  dollarsToCloverCents,
  primaryCategoryName,
  type CloverApiClient,
  type CloverItem,
  type CloverItemCreateInput,
  type CloverPriceType,
} from "@realm/clover";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";
import { uniqueSlug } from "@/lib/products/slug";
import {
  productsRepository,
  type ProductRow,
  type ProductsRepository,
} from "@/lib/services/products.repository";
import {
  findSafeAutoMatch,
  mapCloverCategoryToLocal,
  pricesEqual,
} from "./clover-inventory-match";
import type {
  CloverAmbiguousMatch,
  CloverMatchIncoming,
  CloverPullOneResult,
  CloverPullResult,
  CloverPushOptions,
  CloverPushResult,
  CloverUnlinkedItem,
} from "./clover-inventory-types";

export type {
  CloverAmbiguousMatch,
  CloverMatchIncoming,
  CloverPullOneResult,
  CloverPullResult,
  CloverPushOptions,
  CloverPushResult,
  CloverUnlinkedItem,
} from "./clover-inventory-types";

export {
  findSafeAutoMatch,
  mapCloverCategoryToLocal,
  normalizeProductName,
  pricesEqual,
} from "./clover-inventory-match";

const CLOVER_EXPAND = "categories,itemStock";

function numOrNull(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function cloverItemToIncoming(item: CloverItem): CloverMatchIncoming {
  const hidden = item.hidden === true;
  const cloverAvailable = item.available !== false;
  return {
    cloverItemId: item.id,
    name: item.name,
    price: cloverCentsToDollars(item.price),
    category: mapCloverCategoryToLocal(primaryCategoryName(item)),
    available: cloverAvailable && !hidden,
    sku: item.sku ?? null,
    code: item.code ?? null,
    alternateName: item.alternateName ?? null,
    priceType: typeof item.priceType === "string" ? item.priceType : null,
    hidden,
    cloverAvailable,
    autoManage: typeof item.autoManage === "boolean" ? item.autoManage : null,
    cost: item.cost != null ? cloverCentsToDollars(item.cost) : null,
    unitName: item.unitName ?? null,
    colorCode: item.colorCode ?? null,
    stockQty:
      item.itemStock?.quantity != null && Number.isFinite(item.itemStock.quantity)
        ? item.itemStock.quantity
        : null,
  };
}

function cloverMirrorFields(incoming: CloverMatchIncoming) {
  return {
    cloverSku: incoming.sku,
    cloverCode: incoming.code,
    cloverAlternateName: incoming.alternateName,
    cloverPriceType: incoming.priceType,
    cloverHidden: incoming.hidden,
    cloverAvailable: incoming.cloverAvailable,
    cloverAutoManage: incoming.autoManage,
    cloverCost: incoming.cost != null ? String(incoming.cost) : null,
    cloverUnitName: incoming.unitName,
    cloverColorCode: incoming.colorCode,
    cloverStockQty: incoming.stockQty != null ? String(incoming.stockQty) : null,
  };
}

function buildCloverPushPayload(row: ProductRow): CloverItemCreateInput {
  const cents = dollarsToCloverCents(Number(row.price));
  const active = row.active;
  const hidden = row.cloverHidden ?? !active;
  const available = row.cloverAvailable ?? active;
  const priceType = (row.cloverPriceType as CloverPriceType | null) ?? "FIXED";
  const cost = numOrNull(row.cloverCost);

  return {
    name: row.name,
    price: cents,
    priceType: priceType === "VARIABLE" || priceType === "PER_UNIT" ? priceType : "FIXED",
    hidden,
    available,
    ...(row.cloverAutoManage != null ? { autoManage: row.cloverAutoManage } : {}),
    code: row.cloverCode ?? null,
    sku: row.cloverSku ?? null,
    alternateName: row.cloverAlternateName ?? null,
    ...(cost != null ? { cost: dollarsToCloverCents(cost) } : {}),
    unitName: row.cloverUnitName ?? null,
    colorCode: row.cloverColorCode ?? null,
  };
}

/**
 * Clover Inventory sync engine.
 * All local persistence goes through {@link ProductsRepository} (DAO), not ad-hoc drizzle.
 * Orchestrated from ProductsService for HTTP routes.
 */
export class CloverInventorySyncService {
  constructor(private readonly products: ProductsRepository) {}

  async pull(client: CloverApiClient): Promise<CloverPullResult> {
    const cloverItems = await client.listAllItems({ expand: CLOVER_EXPAND });
    const existing = await this.products.findAll();

    const byCloverId = new Map<string, ProductRow>();
    for (const row of existing) {
      if (row.cloverItemId) byCloverId.set(row.cloverItemId, row);
    }

    const sellableCloverIds = new Set<string>();
    const resolvedLocalIds = new Set<string>();
    const ambiguousLocalIds = new Set<string>();

    let unlinked = existing.filter((r) => !r.cloverItemId);
    const takenSlugs = new Set(existing.map((r) => r.slug).filter((s): s is string => !!s));
    const result: CloverPullResult = {
      created: [],
      updated: [],
      linked: [],
      ambiguous: [],
      markedOutOfStock: [],
      unchanged: 0,
      skippedHidden: 0,
      errors: [],
    };
    const now = Date.now();

    for (const item of cloverItems) {
      try {
        if (item.hidden === true) {
          result.skippedHidden += 1;
          const linkedHidden = byCloverId.get(item.id);
          if (linkedHidden?.active) {
            const incoming = cloverItemToIncoming(item);
            await this.products.updateByInternalId(linkedHidden.id, {
              active: false,
              cloverLastSyncedAt: now,
              ...cloverMirrorFields(incoming),
            });
            result.markedOutOfStock.push({
              publicId: linkedHidden.publicId,
              name: linkedHidden.name,
              reason: "clover_missing",
            });
            resolvedLocalIds.add(linkedHidden.publicId);
          }
          continue;
        }
        sellableCloverIds.add(item.id);
        const incoming = cloverItemToIncoming(item);

        const linked = byCloverId.get(item.id);
        if (linked) {
          const applied = await this.applyCloverInventory(linked, incoming, now);
          resolvedLocalIds.add(linked.publicId);
          if (applied) {
            result.updated.push({
              publicId: linked.publicId,
              name: incoming.name,
              cloverItemId: item.id,
            });
          } else {
            result.unchanged += 1;
          }
          continue;
        }

        const match = findSafeAutoMatch(incoming, unlinked);
        if (match.kind === "auto") {
          await this.linkProduct(match.row.publicId, item.id, { adoptInventory: true, incoming });
          unlinked = unlinked.filter((r) => r.id !== match.row.id);
          byCloverId.set(item.id, { ...match.row, cloverItemId: item.id });
          resolvedLocalIds.add(match.row.publicId);
          result.linked.push({
            publicId: match.row.publicId,
            name: match.row.name,
            cloverItemId: item.id,
          });
          continue;
        }
        if (match.kind === "ambiguous") {
          for (const r of match.rows) ambiguousLocalIds.add(r.publicId);
          result.ambiguous.push({
            incoming,
            candidates: match.rows.map((r) => ({
              publicId: r.publicId,
              name: r.name,
              price: Number(r.price),
              category: r.category,
              active: r.active,
              imageUrl: r.image?.url ?? null,
              reason: pricesEqual(Number(r.price), incoming.price) ? "name_price" : "name",
            })),
          });
          continue;
        }

        const slug = uniqueSlug(item.name, takenSlugs);
        takenSlugs.add(slug);
        const created = await this.products.create({
          name: incoming.name,
          description: null,
          category: incoming.category,
          price: String(incoming.price),
          active: incoming.available,
          source: "manual",
          cloverItemId: item.id,
          cloverLastSyncedAt: now,
          ...cloverMirrorFields(incoming),
          slug,
          syncStatus: "none",
        });

        resolvedLocalIds.add(created.publicId);
        result.created.push({
          publicId: created.publicId,
          name: incoming.name,
          cloverItemId: item.id,
        });
      } catch (e) {
        result.errors.push({
          item: item.name,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    for (const row of existing) {
      if (resolvedLocalIds.has(row.publicId) || ambiguousLocalIds.has(row.publicId)) continue;

      if (row.cloverItemId && !sellableCloverIds.has(row.cloverItemId)) {
        if (row.active) {
          await this.products.updateByInternalId(row.id, {
            active: false,
            cloverLastSyncedAt: now,
            cloverHidden: true,
            cloverAvailable: false,
          });
          result.markedOutOfStock.push({
            publicId: row.publicId,
            name: row.name,
            reason: "clover_missing",
          });
        }
        continue;
      }

      if (!row.cloverItemId && row.source === "uber_eats" && row.active) {
        await this.products.updateByInternalId(row.id, {
          active: false,
          cloverLastSyncedAt: now,
        });
        result.markedOutOfStock.push({
          publicId: row.publicId,
          name: row.name,
          reason: "uber_unlinked",
        });
      }
    }

    return result;
  }

  async pullOne(client: CloverApiClient, publicId: string): Promise<CloverPullOneResult> {
    const row = await this.products.findByPublicId(publicId);
    if (!row) throw new Error("Product not found");
    if (!row.cloverItemId) throw new Error("Product is not linked to Clover");

    const item = await client.getItem(row.cloverItemId, CLOVER_EXPAND);
    const incoming = cloverItemToIncoming(item);
    const now = Date.now();
    const changed = await this.applyCloverInventory(row, incoming, now);
    return {
      publicId: row.publicId,
      name: incoming.name,
      cloverItemId: row.cloverItemId,
      changed,
    };
  }

  async push(client: CloverApiClient, opts: CloverPushOptions = {}): Promise<CloverPushResult> {
    let rows: ProductRow[];
    if (opts.publicIds && opts.publicIds.length > 0) {
      rows = await this.products.findByPublicIds(opts.publicIds);
    } else {
      const all = await this.products.findAll();
      rows = all.filter((r) => Boolean(r.cloverItemId) || (r.active && r.source !== "uber_eats"));
    }

    const result: CloverPushResult = { created: [], updated: [], errors: [] };
    const now = Date.now();

    let categoryByName: Map<string, string> | null = null;
    async function ensureCategoryId(label: string): Promise<string | null> {
      try {
        if (!categoryByName) {
          const cats = await client.listAllCategories();
          categoryByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));
        }
        const key = label.trim().toLowerCase();
        const existing = categoryByName.get(key);
        if (existing) return existing;
        const created = await client.createCategory(label);
        categoryByName.set(key, created.id);
        return created.id;
      } catch {
        return null;
      }
    }

    for (const row of rows) {
      try {
        const payload = buildCloverPushPayload(row);
        const categoryLabel = CATEGORIES[row.category as CategoryId]?.name ?? row.category;
        const stockQty = numOrNull(row.cloverStockQty);

        if (row.cloverItemId) {
          await client.updateItem(row.cloverItemId, payload);
          if (stockQty != null) {
            try {
              await client.updateItemStock(row.cloverItemId, stockQty);
            } catch {
              // Stock endpoint may be unavailable for some merchants — best-effort.
            }
          }
          await this.products.updateByInternalId(row.id, { cloverLastSyncedAt: now });
          result.updated.push({
            publicId: row.publicId,
            name: row.name,
            cloverItemId: row.cloverItemId,
          });
        } else {
          const created = await client.createItem(payload);
          if (stockQty != null) {
            try {
              await client.updateItemStock(created.id, stockQty);
            } catch {
              // Best-effort.
            }
          }
          await this.products.updateByInternalId(row.id, {
            cloverItemId: created.id,
            cloverLastSyncedAt: now,
          });
          const catId = await ensureCategoryId(categoryLabel);
          if (catId) {
            try {
              await client.associateCategoryItem(catId, created.id);
            } catch {
              // Best-effort category association.
            }
          }
          result.created.push({
            publicId: row.publicId,
            name: row.name,
            cloverItemId: created.id,
          });
        }
      } catch (e) {
        result.errors.push({
          item: row.name,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return result;
  }

  async linkProduct(
    publicId: string,
    cloverItemId: string,
    opts: { adoptInventory?: boolean; incoming?: CloverMatchIncoming } = {},
  ): Promise<void> {
    const row = await this.products.findByPublicId(publicId);
    if (!row) throw new Error("Product not found");

    const taken = await this.products.findByCloverItemId(cloverItemId);
    if (taken && taken.publicId !== publicId) {
      throw new Error(`Clover item already linked to ${taken.publicId}`);
    }

    const now = Date.now();
    if (opts.adoptInventory && opts.incoming) {
      await this.products.updateByInternalId(row.id, {
        cloverItemId,
        cloverLastSyncedAt: now,
        name: opts.incoming.name,
        price: String(opts.incoming.price),
        category: opts.incoming.category,
        active: opts.incoming.available,
        ...cloverMirrorFields(opts.incoming),
      });
      return;
    }

    await this.products.updateByInternalId(row.id, {
      cloverItemId,
      cloverLastSyncedAt: now,
    });
  }

  async unlinkProduct(publicId: string): Promise<void> {
    const row = await this.products.findByPublicId(publicId);
    if (!row) throw new Error("Product not found");
    await this.products.updateByInternalId(row.id, {
      cloverItemId: null,
      cloverLastSyncedAt: null,
    });
  }

  async resolveAmbiguous(
    action: "link" | "link_adopt" | "create" | "skip",
    incoming: CloverMatchIncoming,
    existingPublicId?: string,
  ): Promise<void> {
    if (action === "skip") return;

    if (action === "create") {
      const existingSlugs = new Set(await this.products.listSlugs());
      const slug = uniqueSlug(incoming.name, existingSlugs);
      await this.products.create({
        name: incoming.name,
        description: null,
        category: incoming.category,
        price: String(incoming.price),
        active: incoming.available,
        source: "manual",
        cloverItemId: incoming.cloverItemId,
        cloverLastSyncedAt: Date.now(),
        ...cloverMirrorFields(incoming),
        slug,
        syncStatus: "none",
      });
      return;
    }

    if (!existingPublicId) throw new Error("existingPublicId required to link");
    await this.linkProduct(existingPublicId, incoming.cloverItemId, {
      adoptInventory: action === "link_adopt",
      incoming,
    });
  }

  async listUnlinkedCloverItems(client: CloverApiClient): Promise<CloverUnlinkedItem[]> {
    const [cloverItems, linked] = await Promise.all([
      client.listAllItems({ expand: "categories" }),
      this.products.listLinkedCloverItemIds(),
    ]);
    const linkedSet = new Set(linked);
    return cloverItems
      .filter((i) => !i.hidden && !linkedSet.has(i.id))
      .map((i) => {
        const incoming = cloverItemToIncoming(i);
        return {
          cloverItemId: i.id,
          name: i.name,
          price: incoming.price,
          category: primaryCategoryName(i),
          available: incoming.available,
          sku: incoming.sku,
        };
      });
  }

  private async applyCloverInventory(
    row: ProductRow,
    incoming: CloverMatchIncoming,
    now: number,
  ): Promise<boolean> {
    const mirror = cloverMirrorFields(incoming);
    const changed =
      row.name !== incoming.name ||
      !pricesEqual(Number(row.price), incoming.price) ||
      row.active !== incoming.available ||
      row.category !== incoming.category ||
      (row.cloverSku ?? null) !== mirror.cloverSku ||
      (row.cloverCode ?? null) !== mirror.cloverCode ||
      (row.cloverAlternateName ?? null) !== mirror.cloverAlternateName ||
      (row.cloverPriceType ?? null) !== mirror.cloverPriceType ||
      (row.cloverHidden ?? null) !== mirror.cloverHidden ||
      (row.cloverAvailable ?? null) !== mirror.cloverAvailable ||
      (row.cloverAutoManage ?? null) !== mirror.cloverAutoManage ||
      numOrNull(row.cloverCost) !== incoming.cost ||
      (row.cloverUnitName ?? null) !== mirror.cloverUnitName ||
      (row.cloverColorCode ?? null) !== mirror.cloverColorCode ||
      numOrNull(row.cloverStockQty) !== incoming.stockQty;

    if (!changed) {
      await this.products.updateByInternalId(row.id, { cloverLastSyncedAt: now });
      return false;
    }

    await this.products.updateByInternalId(row.id, {
      name: incoming.name,
      price: String(incoming.price),
      category: incoming.category,
      active: incoming.available,
      cloverLastSyncedAt: now,
      ...mirror,
      pendingSync: null,
      syncStatus: row.source === "uber_eats" ? "synced" : row.syncStatus,
    });
    return true;
  }
}

export const cloverInventorySyncService = new CloverInventorySyncService(productsRepository);

/** Exported for unit tests. */
export function cloverItemToLocalFields(item: CloverItem) {
  const incoming = cloverItemToIncoming(item);
  return {
    name: incoming.name,
    price: incoming.price,
    category: incoming.category,
    active: incoming.available,
    sku: incoming.sku,
    code: incoming.code,
    alternateName: incoming.alternateName,
    priceType: incoming.priceType,
    cost: incoming.cost,
    unitName: incoming.unitName,
    colorCode: incoming.colorCode,
    stockQty: incoming.stockQty,
  };
}
