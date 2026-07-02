export const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Returns an error message if the file is not an allowed image within the size cap, else null. */
export function validateUpload(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "Only PNG, JPEG, WebP or GIF images are allowed";
  if (file.size > MAX_UPLOAD_BYTES) return "Image must be 5 MB or smaller";
  return null;
}

/** Lowercase, keep only [a-z0-9._-], collapse repeats. Never returns empty. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "file";
}
