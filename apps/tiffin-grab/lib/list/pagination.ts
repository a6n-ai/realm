import { DEFAULT_SIZE, PAGE_SIZES } from "@foundry/design-system/filters/parse-filter-state";

export type PageState = { page: number; size: number };

/** `?page=&size=` from the URL: a bad page is 0, a size outside PAGE_SIZES is the default. */
export function parsePagination(sp: { get(key: string): string | null }): PageState {
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const size = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  return { page, size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE };
}

export const pageOffset = (page: number, size: number) => page * size;
