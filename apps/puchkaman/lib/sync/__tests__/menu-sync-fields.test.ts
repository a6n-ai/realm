import { describe, expect, it, vi } from "vitest";

// No network: every item in these fixtures has imageUrl null, but stub the
// rehost anyway so a future fixture with a photo can't reach out.
vi.mock("@/lib/sync/rehost-image", () => ({
  rehostImage: vi.fn(async () => ({ url: "https://cdn.test/x.webp", key: "x" })),
}));

const { MenuSyncService } = await import("../menu-sync.service");
import type { MenuSource, MenuSourceItem } from "../menu-source";

type Row = Record<string, unknown> & { id: bigint; publicId: string };

function repo(rows: Row[]) {
  const updates: { id: bigint; patch: Record<string, unknown> }[] = [];
  return {
    updates,
    findAll: async () => rows,
    updateByInternalId: async (id: bigint, patch: Record<string, unknown>) => {
      updates.push({ id, patch });
      Object.assign(
        rows.find((r) => r.id === id) ?? {},
        patch,
      );
      return null;
    },
    create: async (v: Record<string, unknown>) => ({ publicId: `prd_${String(v.name)}` }),
  };
}

function source(items: MenuSourceItem[]): MenuSource {
  return { id: "uber_eats", label: "Uber Eats", fetchItems: async () => items };
}

const ITEM: MenuSourceItem = {
  externalId: "ext-1",
  name: "Butter Chicken",
  description: "Creamy and rich",
  rawCategory: "Chaat",
  category: "chaat",
  price: 15.99,
  imageUrl: null,
  available: true,
};

function existingRow(over: Partial<Row> = {}): Row {
  return {
    id: 1n,
    publicId: "prd_1",
    name: "Buttr Chiken",
    description: "old text",
    price: "12.00",
    category: "chaat",
    source: "uber_eats",
    externalId: "ext-1",
    cloverItemId: null,
    active: true,
    slug: "buttr-chiken",
    image: null,
    lastSyncedImageUrl: null,
    ...over,
  };
}

describe("menu sync — who owns the product fields", () => {
  it("applies name/description/price from Uber when no Clover merchant is connected", async () => {
    const rows = [existingRow()];
    const r = repo(rows);
    const svc = new MenuSyncService(r as never);

    const result = await svc.run(source([ITEM]), { cloverConnected: false });

    expect(result.fieldsUpdated).toHaveLength(1);
    expect(result.fieldsUpdated[0].changed.sort()).toEqual(["description", "name", "price"]);
    expect(rows[0].name).toBe("Butter Chicken");
    expect(rows[0].price).toBe("15.99");
    expect(rows[0].description).toBe("Creamy and rich");
    // A field change must not be reported as a no-op sync.
    expect(result.unchangedCount).toBe(0);
  });

  it("leaves fields alone once Clover is connected — Clover owns inventory", async () => {
    const rows = [existingRow()];
    const svc = new MenuSyncService(repo(rows) as never);

    const result = await svc.run(source([ITEM]), { cloverConnected: true });

    expect(result.fieldsUpdated).toHaveLength(0);
    expect(rows[0].name).toBe("Buttr Chiken");
    expect(rows[0].price).toBe("12.00");
  });

  it("leaves a Clover-linked row alone even while the merchant is disconnected", async () => {
    const rows = [existingRow({ cloverItemId: "CLV123" })];
    const svc = new MenuSyncService(repo(rows) as never);

    const result = await svc.run(source([ITEM]), { cloverConnected: false });

    expect(result.fieldsUpdated).toHaveLength(0);
    expect(rows[0].name).toBe("Buttr Chiken");
  });

  it("reports nothing when the source matches the row", async () => {
    const rows = [
      existingRow({ name: ITEM.name, description: ITEM.description, price: "15.99" }),
    ];
    const svc = new MenuSyncService(repo(rows) as never);

    const result = await svc.run(source([ITEM]), { cloverConnected: false });

    expect(result.fieldsUpdated).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it("compares price as fixed-point, so 15.9 and 15.90 are not a change", async () => {
    const rows = [existingRow({ name: ITEM.name, description: ITEM.description, price: "15.90" })];
    const svc = new MenuSyncService(repo(rows) as never);

    const result = await svc.run(source([{ ...ITEM, price: 15.9 }]), { cloverConnected: false });

    expect(result.fieldsUpdated).toHaveLength(0);
  });
});

describe("Clover owns which products exist", () => {
  it("does not create an Uber-only item when Clover is connected", async () => {
    const created: unknown[] = [];
    const base = repo([]);
    const svc = new MenuSyncService({
      ...base,
      create: async (v: Record<string, unknown>) => {
        created.push(v);
        return { publicId: "prd_new" };
      },
    } as never);

    const result = await svc.run(source([ITEM]), { cloverConnected: true });

    expect(created).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.skippedNotInClover).toEqual([
      { name: ITEM.name, rawCategory: ITEM.rawCategory },
    ]);
  });

  it("still creates it when no Clover merchant is connected", async () => {
    const svc = new MenuSyncService(repo([]) as never);

    const result = await svc.run(source([ITEM]), { cloverConnected: false });

    expect(result.added).toHaveLength(1);
    expect(result.skippedNotInClover).toHaveLength(0);
  });

  // Linking an Uber item to a Clover product stamps source/externalId onto the
  // Clover row (see resolveDuplicate), which is how later syncs find it again.
  it("keeps donating a photo to a product Clover already owns", async () => {
    const rows = [
      existingRow({
        name: ITEM.name,
        description: ITEM.description,
        price: "15.99",
        source: "uber_eats",
        externalId: "ext-1",
        cloverItemId: "CLV1",
      }),
    ];
    const r = repo(rows);
    const svc = new MenuSyncService(r as never);

    const result = await svc.run(source([{ ...ITEM, imageUrl: "https://img.test/a.jpg" }]), {
      cloverConnected: true,
    });

    expect(result.imagesUpdated).toHaveLength(1);
    expect(result.skippedNotInClover).toHaveLength(0);
    // Clover's fields are untouched — only the photo moved.
    expect(result.fieldsUpdated).toHaveLength(0);
    expect(r.updates.some((u) => "image" in u.patch)).toBe(true);
  });
});

// Every remaining route by which Uber data could reach a Clover-owned record.
describe("Uber contributes the photo and nothing else", () => {
  function repoWithRow(row: Row) {
    const updates: { publicId: string; patch: Record<string, unknown> }[] = [];
    const created: unknown[] = [];
    return {
      updates,
      created,
      findAll: async () => [row],
      findByPublicId: async () => row,
      listSlugs: async () => [],
      create: async (v: Record<string, unknown>) => {
        created.push(v);
        return { publicId: "prd_new" };
      },
      updateByPublicId: async (publicId: string, patch: Record<string, unknown>) => {
        updates.push({ publicId, patch });
        return null;
      },
      updateByInternalId: async (_id: bigint, patch: Record<string, unknown>) => {
        updates.push({ publicId: row.publicId, patch });
        return null;
      },
    };
  }

  it("resolveDuplicate 'replace' does not carry description onto a Clover row", async () => {
    const r = repoWithRow(existingRow({ cloverItemId: "CLV1", externalId: null }));
    const svc = new MenuSyncService(r as never);

    await svc.resolveDuplicate("prd_1", "replace", ITEM, { cloverConnected: true });

    const patch = r.updates[0].patch;
    expect(patch).toHaveProperty("image");
    expect(patch).not.toHaveProperty("description");
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("price");
  });

  it("resolveDuplicate 'replace' still owns the row when Clover is absent", async () => {
    const r = repoWithRow(existingRow({ cloverItemId: null, externalId: null }));
    const svc = new MenuSyncService(r as never);

    await svc.resolveDuplicate("prd_1", "replace", ITEM, { cloverConnected: false });

    const patch = r.updates[0].patch;
    expect(patch.name).toBe(ITEM.name);
    expect(patch.description).toBe(ITEM.description);
  });

  it("resolveDuplicate 'skip' creates nothing when Clover is connected", async () => {
    const r = repoWithRow(existingRow());
    const svc = new MenuSyncService(r as never);

    await svc.resolveDuplicate("prd_1", "skip", ITEM, { cloverConnected: true });

    expect(r.created).toHaveLength(0);
  });

  it("applyPending ignores queued name/price/description on a Clover row", async () => {
    const row = existingRow({
      cloverItemId: "CLV1",
      pendingSync: {
        name: "Uber Name",
        description: "Uber text",
        price: 22.5,
        imageUrl: "https://img.test/new.jpg",
      },
    });
    const r = repoWithRow(row);
    const svc = new MenuSyncService(r as never);

    await svc.applyPending("prd_1", "apply_all", { cloverConnected: true });

    const patch = r.updates[0].patch;
    expect(patch).toHaveProperty("image");
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("description");
    expect(patch).not.toHaveProperty("price");
    // the ignored fields are dropped, so the row does not sit on a permanent
    // "update available" that can never be applied
    expect(patch.pendingSync).toBeNull();
    expect(patch.syncStatus).toBe("synced");
  });

  it("applyPending still applies queued fields on a row Clover does not own", async () => {
    const row = existingRow({
      cloverItemId: null,
      pendingSync: { name: "Uber Name", price: 22.5 },
    });
    const r = repoWithRow(row);
    const svc = new MenuSyncService(r as never);

    await svc.applyPending("prd_1", "apply_all", { cloverConnected: false });

    const patch = r.updates[0].patch;
    expect(patch.name).toBe("Uber Name");
    expect(patch.price).toBe("22.50");
  });
});
