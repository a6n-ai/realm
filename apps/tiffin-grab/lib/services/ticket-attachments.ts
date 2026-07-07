import { nanoid } from "nanoid";
import { ValidationError } from "@realm/commons";
import { filesSecuredAccess, filesService, securedFilesService } from "@/lib/files";
import type { Attachment } from "@/db/schema";

const ACCEPT = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;
const HREF_TTL_SECONDS = 3600;

const files = (entries: FormDataEntryValue[]): File[] =>
  entries.filter((e): e is File => e instanceof File && e.size > 0);
const safe = (name: string): string => name.replace(/[^\w.\-]+/g, "_") || "image";
const bytesOf = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

// Upload each reply image as a secured original + a static thumbnail, paired by
// index (the composer appends attachment[i] and attachment_thumb[i] in step).
// ponytail: upload runs before ticketsService.reply's assertAccess — a non-owner
// could spray orphan files into the prefix (storage spam only, no data leak).
export async function uploadAttachments(
  ticketId: string,
  origEntries: FormDataEntryValue[],
  thumbEntries: FormDataEntryValue[],
): Promise<Attachment[]> {
  const origs = files(origEntries);
  const thumbs = files(thumbEntries);
  if (origs.length === 0) return [];
  if (origs.length > MAX_FILES) throw new ValidationError(`Attach up to ${MAX_FILES} images`);
  if (thumbs.length !== origs.length) throw new ValidationError("Attachment thumbnails missing");

  const out: Attachment[] = [];
  for (let i = 0; i < origs.length; i++) {
    const orig = origs[i];
    const thumb = thumbs[i];
    if (!ACCEPT.has(orig.type)) throw new ValidationError("Only PNG, JPEG, WebP or GIF images are allowed");
    if (orig.size > MAX_BYTES) throw new ValidationError("Each image must be 5 MB or smaller");
    if (!ACCEPT.has(thumb.type) || thumb.size > MAX_BYTES) throw new ValidationError("Bad thumbnail");

    const base = `tickets/${ticketId}/${nanoid()}`;
    const origDetail = await securedFilesService().create(`${base}/orig-${safe(orig.name)}`, await bytesOf(orig), { contentType: orig.type });
    const thumbDetail = await filesService().create(`${base}/thumb-${safe(thumb.name)}`, await bytesOf(thumb), { contentType: thumb.type });
    out.push({ path: origDetail.filePath, thumbUrl: thumbDetail.url ?? thumbDetail.filePath, name: orig.name });
  }
  return out;
}

// Mint a short-lived token for one secured original and build its served URL.
// Called at render for a viewer who already passed the ticket's assertAccess.
// ponytail: one access-key row per attachment per render; TTL + accessLimit cap
// abuse. Add a periodic prune of expired files_secured_access_key rows if it grows.
export async function attachmentHref(a: Attachment): Promise<string> {
  const { accessKey } = await filesSecuredAccess.mint(a.path, { ttlSeconds: HREF_TTL_SECONDS, limit: 20 });
  return `/api/files/${a.path}?ak=${accessKey}`;
}
