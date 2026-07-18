import { nanoid } from "nanoid";
import type { FileDetail } from "@realm/storage/model";
import { filesService } from "@/lib/files";

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

// Downloads a source image (e.g. a synced item's Uber Eats photo) and
// re-uploads it into our own storage via the existing filesService — the
// public site only ever renders FileDetail.url from our storage, never the
// source URL. Called only when an admin actually applies an image (new
// product creation, or applying a pending sync update), never speculatively.
export async function rehostImage(sourceUrl: string, prefix: string): Promise<FileDetail> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to download image (${res.status}): ${sourceUrl}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const key = `${prefix}/${nanoid()}/image.${extensionFor(contentType)}`;
  return filesService().create(key, bytes, { contentType });
}
