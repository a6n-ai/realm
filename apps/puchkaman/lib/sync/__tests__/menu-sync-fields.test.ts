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
