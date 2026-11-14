import { nanoid } from "nanoid";
import { sniffUploadImage, type UploadImageType } from "@foundry/commons/util/image-sniff";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Lowercase, keep only [a-z0-9._-], collapse repeats. Never returns empty. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return "file";
  return cleaned;
}

/** `<prefix>/<nanoid>/<name>`: the one object-key layout for uploads. */
export const uploadKey = (prefix: string, name: string): string => `${prefix}/${nanoid()}/${sanitizeFilename(name)}`;

/** Size and sniff the bytes (File.type only reflects the file name, so a renamed PDF would pass it). */
export async function readImageUpload(file: File): Promise<{ bytes: Uint8Array; type: UploadImageType } | { error: string }> {
  if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be 5 MB or smaller" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffUploadImage(bytes);
  if (!type) return { error: "Only PNG, JPEG, WebP or GIF images are allowed" };
  return { bytes, type };
}
