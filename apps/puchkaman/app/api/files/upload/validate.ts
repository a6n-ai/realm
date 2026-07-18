export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateUpload(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Only PNG, JPEG, WebP or GIF images are allowed";
  if (file.size > MAX_UPLOAD_BYTES) return "Image must be 5 MB or smaller";
  return null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
