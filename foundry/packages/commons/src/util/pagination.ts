export interface PageRequest {
  page: number;
  size: number;
  sort?: { field: string; dir: "asc" | "desc" };
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export const DEFAULT_PAGE: PageRequest = { page: 0, size: 10 };
