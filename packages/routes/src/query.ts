import type { Condition, PageRequest } from "@realm/commons";

export interface Query {
  page?: number;
  size?: number;
  sort?: { field: string; dir: "asc" | "desc" };
  condition?: Condition;
}

export function parseListParams(url: URL): PageRequest {
  const page = Number(url.searchParams.get("page") ?? "0");
  const size = Number(url.searchParams.get("size") ?? "10");
  const sortField = url.searchParams.get("sort");
  const dir = url.searchParams.get("dir") === "desc" ? "desc" : "asc";
  const req: PageRequest = { page: Number.isFinite(page) ? page : 0, size: Number.isFinite(size) ? size : 10 };
  if (sortField) req.sort = { field: sortField, dir };
  return req;
}
