export interface FileDetail {
  id?: string;
  name: string;
  fileName: string;
  type?: string;
  isDirectory: boolean;
  size: number;
  filePath: string;
  url?: string;
  createdDate?: number;
  lastModifiedTime?: number;
}

// Mirrors nocode-saas FileDetail.setName: split on the LAST dot. ind <= 0 means
// no dot (-1) or a leading dot (0) — either way the whole string is the fileName.
export function parseName(name: string): { fileName: string; type?: string } {
  const n = name ?? "";
  const ind = n.lastIndexOf(".");
  if (ind <= 0) return { fileName: n };
  return { fileName: n.slice(0, ind), type: n.slice(ind + 1).toLowerCase() };
}

export function normalizePath(p: string | undefined): string | undefined {
  return p == null ? p : p.replace(/\/{2,}/g, "/");
}
