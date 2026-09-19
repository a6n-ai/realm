export const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateUpload(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return "Only PNG, JPEG, WebP or GIF images are allowed";
  if (file.size > MAX_UPLOAD_BYTES) return "Image must be 5 MB or smaller";
  return null;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return "file";
  return cleaned;
}
