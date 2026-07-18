import type { CategoryId } from "@/lib/menu-categories";

// A single incoming menu item from an external provider, already normalized
// to our shape as much as possible. `category` is `null` when the provider's
// raw category label has no entry in that source's category map — the sync
// engine surfaces these under `categoryIssues` rather than guessing.
export type MenuSourceItem = {
  externalId: string;
  name: string;
  description: string | null;
  rawCategory: string;
  category: CategoryId | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
};

// Provider-agnostic: "where does sync data come from". Uber Eats today reads
// a committed snapshot file (see sources/uber-eats-snapshot-source.ts) since
// there's no live API to call — a future provider (a real API, a different
// snapshot, a CSV upload) just implements this same interface.
export interface MenuSource {
  readonly id: string;
  readonly label: string;
  fetchItems(): Promise<MenuSourceItem[]>;
}
