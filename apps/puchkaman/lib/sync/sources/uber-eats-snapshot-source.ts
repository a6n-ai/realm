import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CategoryId } from "@/lib/menu-categories";
import { CATEGORY_IDS } from "@/lib/menu-categories";
import { UBER_EATS_CATEGORY_MAP } from "@/lib/sync/category-map";
import type { MenuSource, MenuSourceItem } from "@/lib/sync/menu-source";

const SNAPSHOT_PATH = path.join(process.cwd(), "lib/sync/snapshots/uber-eats.json");

type SnapshotItem = {
  externalId: string;
  name: string;
  description: string | null;
  rawCategory: string;
  category: string;
  price: number;
  imageUrl: string | null;
  available: boolean;
};

type Snapshot = {
  provider: "uber_eats";
  storeUrl: string;
  storeName: string;
  fetchedAt: string;
  items: SnapshotItem[];
};

function isCategoryId(v: string): v is CategoryId {
  return (CATEGORY_IDS as string[]).includes(v);
}

// Reads the committed snapshot file rather than calling ubereats.com — Uber
// Eats has no public API and scraping their site live would violate their
// ToS and get blocked by bot protection. This file is refreshed on request
// (an agent browses the public menu URL and regenerates it), not fetched
// automatically. See lib/sync/snapshots/uber-eats.json.
export class UberEatsSnapshotSource implements MenuSource {
  readonly id = "uber_eats";
  readonly label = "Uber Eats";

  async fetchItems(): Promise<MenuSourceItem[]> {
    const raw = await readFile(SNAPSHOT_PATH, "utf-8");
    const snapshot = JSON.parse(raw) as Snapshot;

    return snapshot.items.map((item) => {
      // Prefer the raw-category map (the reviewable, versioned source of
      // truth); fall back to the category already baked into the snapshot
      // (covers per-item overrides like Beverages' chai-vs-soda split).
      const mapped = UBER_EATS_CATEGORY_MAP[item.rawCategory];
      const fallback = isCategoryId(item.category) ? item.category : null;
      return {
        externalId: item.externalId,
        name: item.name,
        description: item.description,
        rawCategory: item.rawCategory,
        category: mapped ?? fallback,
        price: item.price,
        imageUrl: item.imageUrl,
        available: item.available,
      };
    });
  }
}
