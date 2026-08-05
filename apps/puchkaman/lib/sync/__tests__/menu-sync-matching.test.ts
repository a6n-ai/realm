import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sync/rehost-image", () => ({
  rehostImage: vi.fn(async () => ({ url: "https://cdn.test/x.webp", key: "x" })),
}));

const { MenuSyncService } = await import("../menu-sync.service");
import type { MenuSource, MenuSourceItem } from "../menu-source";

type Row = Record<string, unknown> & { id: bigint; publicId: string };

function repo(rows: Row[]) {
  return {
    findAll: async () => rows,
    updateByInternalId: async () => null,
    create: async (v: Record<string, unknown>) => ({ publicId: `prd_${String(v.name)}` }),
  };
}

const source = (items: MenuSourceItem[]): MenuSource => ({
  id: "uber_eats",
  label: "Uber Eats",
  fetchItems: async () => items,
});

const uberItem = (over: Partial<MenuSourceItem> = {}): MenuSourceItem => ({
  externalId: "ext-1",
  name: "Masala Chai",
  description: null,
  rawCategory: "Beverages",
  category: "hot",
  price: 3.99,
  imageUrl: "https://uber.test/chai.jpg",
  available: true,
  ...over,
});

/** A Clover-owned product: no Uber externalId, so it is a match candidate. */
const cloverRow = (over: Partial<Row> = {}): Row => ({
  id: 1n,
  publicId: "prd_1",
  name: "Masala Chai",
  description: null,
  price: "3.99",
  // Clover's own labels do not map onto our category set, so its products land here.
  category: "extra",
  source: "clover",
  externalId: null,
  cloverItemId: "CLV1",
  active: true,
  slug: "masala-chai",
  image: null,
  lastSyncedImageUrl: null,
  ...over,
});

describe("menu sync — matching an Uber item to a Clover product", () => {
  // The regression this guards: category used to be part of the match key, so a
  // Clover product sitting in `extra` never matched an Uber item mapped to `hot`,
  // and the dish was reported as "not in Clover" despite being right there.
  it("matches on name even when the categories disagree", async () => {
    const rows = [cloverRow({ category: "extra" })];
    const svc = new MenuSyncService(repo(rows) as never);
    const result = await svc.run(source([uberItem({ category: "hot" })]), {
      cloverConnected: true,
    });

    expect(result.skippedNotInClover).toHaveLength(0);
    expect(result.duplicates.map((d) => d.existingPublicId)).toEqual(["prd_1"]);
  });

  it("still reports an item that genuinely has no counterpart", async () => {
    const svc = new MenuSyncService(repo([cloverRow()]) as never);
    const result = await svc.run(source([uberItem({ name: "Spicy Prawn Puchka" })]), {
      cloverConnected: true,
    });

    expect(result.duplicates).toHaveLength(0);
    expect(result.skippedNotInClover.map((i) => i.name)).toEqual(["Spicy Prawn Puchka"]);
  });

  // Clover holds real duplicates; picking one at random would hang the photo on
  // the wrong row, so these are surfaced instead.
  it("refuses to guess when two products share a name", async () => {
    const rows = [cloverRow(), cloverRow({ id: 2n, publicId: "prd_2", cloverItemId: "CLV2" })];
    const svc = new MenuSyncService(repo(rows) as never);
    const result = await svc.run(source([uberItem()]), { cloverConnected: true });

    expect(result.duplicates).toHaveLength(0);
    expect(result.ambiguousName).toEqual([{ name: "Masala Chai", matches: 2 }]);
    // Never mislabelled as absent — it is in Clover, twice.
    expect(result.skippedNotInClover).toHaveLength(0);
  });

  it("matches across a trailing portion note on the Clover name", async () => {
    const rows = [cloverRow({ name: "Masala Chai(2 Cups)" })];
    const svc = new MenuSyncService(repo(rows) as never);
    const result = await svc.run(source([uberItem()]), { cloverConnected: true });

    expect(result.duplicates.map((d) => d.existingPublicId)).toEqual(["prd_1"]);
  });
});
