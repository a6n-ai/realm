import { ValidationError } from "@foundry/commons";

export const MAX_CLASS_PHOTOS = 6;

export function parsePhotos(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of raw) {
    const url = String(item ?? "").trim();
    if (!url) continue;
    if (!isAllowedPhotoUrl(url)) throw new ValidationError("Class photos must be uploaded files.");
    if (!out.includes(url)) out.push(url);
  }
  if (out.length > MAX_CLASS_PHOTOS) throw new ValidationError("Up to 6 photos per class.");
  return out;
}

function isAllowedPhotoUrl(url: string): boolean {
  if (url.includes("..") || url.includes("\\")) return false;
  if (url.startsWith("/api/files/")) return true;
  const base = process.env.FILES_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return Boolean(base && url.startsWith(`${base}/`));
}
