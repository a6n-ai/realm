import { NotFoundError, ValidationError } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { getCloverConnection } from "@realm/clover";
import { columnResolver, conditionToSql } from "@realm/database";
import { asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  orderItems,
  productCategoryItems,
  productModifierGroups,
  products,
} from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import { filesService } from "@/lib/files";
import type { SortState } from "@/lib/list/sort";
import { isCloverInventoryConnected } from "@/lib/products/availability";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { productSchema } from "@/lib/products/schema";
import {
  cloverInventorySyncService,
  cloverItemToIncoming,
  type CloverMatchIncoming,
  type CloverPullOneResult,
  type CloverPullResult,
  type CloverPushResult,
  type CloverUnlinkedItem,
} from "@/lib/sync/clover-inventory-sync.service";
import {
  menuSyncService,
  type SyncOptions,
  type SyncResult,
} from "@/lib/sync/menu-sync.service";
import type { MenuSourceItem } from "@/lib/sync/menu-source";
import { UberEatsSnapshotSource } from "@/lib/sync/sources/uber-eats-snapshot-source";
import {
  productsRepository,
  type ProductRow,
  ProductsRepository,
} from "./products.repository";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

export type ProductListRow = ProductRow;

function normalizeProductWrite(values: Record<string, unknown>) {
  const next = { ...values };
  if (typeof next.price === "number") next.price = String(next.price);
  if (typeof next.cloverCost === "number") next.cloverCost = String(next.cloverCost);
  if (typeof next.cloverStockQty === "number") next.cloverStockQty = String(next.cloverStockQty);
  return next;
}

/** Admin product detail DTO (numbers coerced for forms). */
export type ProductDetailDto = {
  publicId: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  image: ProductRow["image"];
  tags: string[] | null;
  veg: boolean | null;
  active: boolean;
  featured: boolean;
  source: ProductRow["source"];
  syncStatus: ProductRow["syncStatus"];
  cloverItemId: string | null;
  cloverLastSyncedAt: number | null;
  cloverSku: string | null;
  cloverCode: string | null;
  cloverAlternateName: string | null;
  cloverPriceType: string | null;
  cloverHidden: boolean | null;
  cloverAvailable: boolean | null;
  cloverAutoManage: boolean | null;
  cloverCost: number | null;
  cloverUnitName: string | null;
  cloverColorCode: string | null;
  cloverStockQty: number | null;
  cloverOnlineName: string | null;
  cloverEnabledOnline: boolean | null;
  cloverAgeRestricted: boolean | null;
  cloverDefaultTaxRates: boolean | null;
  cloverIsRevenue: boolean | null;
};

export function toProductDetailDto(row: ProductRow): ProductDetailDto {
  return {
    publicId: row.publicId,
    name: row.name,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    image: row.image,
    tags: row.tags,
    veg: row.veg ?? null,
    active: row.active,
    featured: row.featured,
    source: row.source,
    syncStatus: row.syncStatus,
    cloverItemId: row.cloverItemId ?? null,
    cloverLastSyncedAt: row.cloverLastSyncedAt ?? null,
    cloverSku: row.cloverSku ?? null,
    cloverCode: row.cloverCode ?? null,
    cloverAlternateName: row.cloverAlternateName ?? null,
    cloverPriceType: row.cloverPriceType ?? null,
    cloverHidden: row.cloverHidden ?? null,
    cloverAvailable: row.cloverAvailable ?? null,
    cloverAutoManage: row.cloverAutoManage ?? null,
    cloverCost: row.cloverCost != null ? Number(row.cloverCost) : null,
    cloverUnitName: row.cloverUnitName ?? null,
    cloverColorCode: row.cloverColorCode ?? null,
    cloverStockQty: row.cloverStockQty != null ? Number(row.cloverStockQty) : null,
    cloverOnlineName: row.cloverOnlineName ?? null,
    cloverEnabledOnline: row.cloverEnabledOnline ?? null,
    cloverAgeRestricted: row.cloverAgeRestricted ?? null,
    cloverDefaultTaxRates: row.cloverDefaultTaxRates ?? null,
    cloverIsRevenue: row.cloverIsRevenue ?? null,
  };
}

// Keys match DataTable column keys (see products-table.tsx). "status" sorts by
// active (Active/Archived); "lastSynced" by last_synced_at.
export type ProductSortColumn =
  | "name"
  | "category"
  | "price"
  | "status"
  | "source"
  | "lastSynced";

const log = createLogger("products-service");

const PRODUCT_SORT_COL = {
  name: products.name,
  category: products.category,
  price: products.price,
  status: products.active,
  source: products.source,
  lastSynced: products.lastSyncedAt,
} as const;

function resolveProductFacet(f: FilterCondition) {
  if (f.field === "featured") return eq(products.featured, f.value === "true");
  return columnResolver({
    category: products.category,
    source: products.source,
    syncStatus: products.syncStatus,
    name: products.name,
    slug: products.slug,
  })(f);
}

/**
 * Products domain service.
 * Extends {@link SessionUpdatableService} (CRUD → audit_log); DAO is
 * {@link ProductsRepository} (extends {@link UpdatableRepository}).
 */
class ProductsService extends SessionUpdatableService<typeof products> {
  constructor(protected readonly repo: ProductsRepository) {
    super(repo);
  }

  async create(values: Record<string, unknown>) {
    return super.create(normalizeProductWrite(productSchema.parse(values)));
  }

  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, normalizeProductWrite(productSchema.partial().parse(patch)));
  }

  // Soft delete: keep the row but drop it off the public menu.
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }

  /** Detail page load — NotFoundError when missing. */
  async getDetail(publicId: string): Promise<ProductDetailDto> {
    return toProductDetailDto(await this.read(publicId));
  }

  async listActive() {
    return db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category), asc(products.name));
  }

  /** Full catalog for the public menu — includes inactive / OOS rows for browse. */
  // orgId scopes rows to a franchise's own Clover-synced products plus any
  // row with a null organizationId (Uber-sourced items, unscoped — Uber is
  // image-only and not franchise-specific). Omit it to see every row.
  async listForPublicMenu(orgId?: string | null) {
    return db
      .select()
      .from(products)
      .where(orgId ? or(isNull(products.organizationId), eq(products.organizationId, orgId)) : undefined)
      .orderBy(asc(products.category), asc(products.displayOrder), asc(products.name));
  }

  async listAll() {
    return this.repo.findAll().then((rows) =>
      [...rows].sort((a, b) =>
        a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category),
      ),
    );
  }

  async queryProducts(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<ProductSortColumn> = { column: "category", dir: "asc" },
  ): Promise<Page<ProductListRow>> {
    const where = conditionToSql(condition, resolveProductFacet);
    const col = PRODUCT_SORT_COL[sort.column] ?? products.category;

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(where),
    ]);

    return { items, page: page.page, size: page.size, total: count };
  }

  async productStats(): Promise<{
    total: number;
    featured: number;
    categories: number;
  }> {
    const [[{ total }], [{ featured }], [{ categories }]] = await Promise.all([
      db.select({ total: sql<number>`cast(count(*) as int)` }).from(products),
      db
        .select({ featured: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(eq(products.featured, true)),
      db.select({ categories: sql<number>`cast(count(distinct ${products.category}) as int)` }).from(products),
    ]);

    return { total, featured, categories };
  }

  async recentProducts(limit: number): Promise<ProductListRow[]> {
    return db.select().from(products).orderBy(desc(products.createdAt)).limit(limit);
  }

  async featuredProducts(limit: number): Promise<ProductListRow[]> {
    return db
      .select()
      .from(products)
      .where(eq(products.featured, true))
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }

  // ── Clover inventory (route → this service → ProductsRepository + Clover client)

  private async requireCloverClient() {
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(
        "Clover is not connected. Install the plugin under Settings → Integrations, then connect a merchant under Settings → Clover.",
      );
    }
    return client;
  }

  /** Single-product pull or push. */
  async syncCloverOne(
    publicId: string,
    direction: "pull" | "push",
  ): Promise<
    | { direction: "pull"; result: CloverPullOneResult }
    | { direction: "push"; result: CloverPushResult }
  > {
    await this.read(publicId);
    const client = await this.requireCloverClient();

    if (direction === "pull") {
      const result = await cloverInventorySyncService.pullOne(client, publicId);
      await recordAudit({
        entity: "products",
        entityPublicId: publicId,
        operation: "update",
        changes: { _action: "clover_sync_one_pull", result },
        createdBy: await currentUserId(),
      });
      return { direction, result };
    }

    const result = await cloverInventorySyncService.push(client, { publicIds: [publicId] });
    if (result.errors.length > 0 && result.created.length === 0 && result.updated.length === 0) {
      throw new ValidationError(result.errors[0]?.message ?? "Push failed");
    }
    await recordAudit({
      entity: "products",
      entityPublicId: publicId,
      operation: "update",
      changes: { _action: "clover_sync_one_push", result },
      createdBy: await currentUserId(),
    });
    return { direction, result };
  }

  /** Bulk pull/push (products list Sync Clover dialog). */
  async syncCloverBulk(
    direction: "pull" | "push",
    publicIds?: string[],
  ): Promise<{ direction: "pull" | "push"; result: CloverPullResult | CloverPushResult }> {
    const client = await this.requireCloverClient();
    if (direction === "pull") {
      const result = await cloverInventorySyncService.pull(client);
      await recordAudit({
        entity: "products",
        entityPublicId: "bulk",
        operation: "update",
        changes: { _action: "clover_sync_pull", result },
        createdBy: await currentUserId(),
      });
      return { direction, result };
    }
    const result = await cloverInventorySyncService.push(client, { publicIds });
    await recordAudit({
      entity: "products",
      entityPublicId: "bulk",
      operation: "update",
      changes: { _action: "clover_sync_push", publicIds: publicIds ?? null, result },
      createdBy: await currentUserId(),
    });
    return { direction, result };
  }

  async linkClover(
    publicId: string,
    cloverItemId: string,
    opts: { adoptInventory?: boolean } = {},
  ): Promise<{ ok: true; cloverItemId: string }> {
    await this.read(publicId);
    let incoming: CloverMatchIncoming | undefined;
    if (opts.adoptInventory) {
      const client = await this.requireCloverClient();
      const item = await client.getItem(cloverItemId, "categories,itemStock");
      incoming = cloverItemToIncoming(item);
    }
    await cloverInventorySyncService.linkProduct(publicId, cloverItemId, {
      adoptInventory: opts.adoptInventory,
      incoming,
    });
    await recordAudit({
      entity: "products",
      entityPublicId: publicId,
      operation: "update",
      changes: {
        _action: "clover_link",
        cloverItemId,
        adoptInventory: opts.adoptInventory ?? false,
      },
      createdBy: await currentUserId(),
    });
    return { ok: true, cloverItemId };
  }

  async unlinkClover(publicId: string): Promise<{ ok: true; cloverItemId: null }> {
    await this.read(publicId);
    await cloverInventorySyncService.unlinkProduct(publicId);
    await recordAudit({
      entity: "products",
      entityPublicId: publicId,
      operation: "update",
      changes: { _action: "clover_unlink" },
      createdBy: await currentUserId(),
    });
    return { ok: true, cloverItemId: null };
  }

  async listUnlinkedCloverItems(): Promise<CloverUnlinkedItem[]> {
    const client = await this.requireCloverClient();
    return cloverInventorySyncService.listUnlinkedCloverItems(client);
  }

  async resolveCloverAmbiguous(
    action: "link" | "link_adopt" | "create" | "skip",
    incoming: CloverMatchIncoming,
    existingPublicId?: string,
  ): Promise<void> {
    if (action === "link" || action === "link_adopt") {
      if (!existingPublicId) throw new ValidationError("existingPublicId required to link");
      const row = await this.repo.findByPublicId(existingPublicId);
      if (!row) throw new NotFoundError(`Not found: ${existingPublicId}`);
    }
    await cloverInventorySyncService.resolveAmbiguous(action, incoming, existingPublicId);
    await recordAudit({
      entity: "products",
      entityPublicId: existingPublicId ?? incoming.cloverItemId ?? "bulk",
      operation: "update",
      changes: {
        _action: "clover_resolve_ambiguous",
        action,
        cloverItemId: incoming.cloverItemId ?? null,
        existingPublicId: existingPublicId ?? null,
      },
      createdBy: await currentUserId(),
    });
  }

  // ── Uber Eats catalogue sync (route → this service → ProductsRepository).
  // Full product sync (name/description/price/category + photo) while no Clover
  // merchant is connected; photo-only once Clover owns inventory. The
  // cloverConnected flag below is what selects between the two.

  async syncUberImages(opts: SyncOptions = {}): Promise<SyncResult> {
    const clover = await getCloverConnection(integrationsConfigStore);
    const result = await menuSyncService.run(new UberEatsSnapshotSource(), {
      ...opts,
      cloverConnected: isCloverInventoryConnected(clover),
    });
    await recordAudit({
      entity: "products",
      entityPublicId: "bulk",
      operation: "update",
      changes: { _action: "uber_images_sync", result },
      createdBy: await currentUserId(),
    });
    return result;
  }

  async resolveUberDuplicate(
    existingPublicId: string,
    action: "replace" | "keep" | "skip",
    incoming: MenuSourceItem,
  ): Promise<{ ok: true }> {
    if (action !== "skip") await this.read(existingPublicId);
    const clover = await getCloverConnection(integrationsConfigStore);
    await menuSyncService.resolveDuplicate(existingPublicId, action, incoming, {
      cloverConnected: isCloverInventoryConnected(clover),
    });
    await recordAudit({
      entity: "products",
      entityPublicId: existingPublicId,
      operation: "update",
      changes: {
        _action: "uber_resolve_duplicate",
        action,
        incomingName: incoming.name ?? null,
      },
      createdBy: await currentUserId(),
    });
    return { ok: true };
  }
  /**
   * TEMPORARY — remove when the Clover catalogue rebuild is done (see the
   * "Delete all products" button in products-header-actions.tsx and
   * app/api/products/delete-all/route.ts; deleting those three plus this
   * method removes the feature entirely).
   *
   * Wipes the whole catalogue so a Clover pull can rebuild it from the POS.
   * Deletes the rehosted product photos from storage too, otherwise the
   * blobs are orphaned the moment their rows go: nothing else references
   * them and no GC sweeps them up.
   *
   * `order_items.product_id` is a plain FK, so order lines go first — those
   * orders keep their totals but lose their itemisation, permanently.
   */
  async deleteAllProducts(): Promise<{
    products: number;
    orderLines: number;
    imagesDeleted: number;
    imageErrors: number;
  }> {
    const rows = await db.select({ image: products.image }).from(products);
    const [{ orderLines }] = await db
      .select({ orderLines: sql<number>`count(*)::int` })
      .from(orderItems);

    // Storage first: a failed delete here must not leave rows pointing at
    // blobs we already removed, and a leftover blob is cheaper than a broken row.
    let imagesDeleted = 0;
    let imageErrors = 0;
    for (const row of rows) {
      const path = row.image?.filePath;
      if (!path) continue;
      try {
        await filesService().delete(path);
        imagesDeleted++;
      } catch (e) {
        imageErrors++;
        log.warn(
          { path, err: e instanceof Error ? e.message : e },
          "could not delete product image from storage",
        );
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(orderItems);
      await tx.delete(productCategoryItems);
      await tx.delete(productModifierGroups);
      await tx.delete(products);
    });

    await recordAudit({
      entity: "products",
      entityPublicId: "*",
      operation: "delete",
      changes: {
        _action: "delete_all_products",
        products: rows.length,
        orderLines,
        imagesDeleted,
        imageErrors,
      },
      createdBy: await currentUserId(),
    });

    return { products: rows.length, orderLines, imagesDeleted, imageErrors };
  }
}

export const productsService = new ProductsService(productsRepository);
