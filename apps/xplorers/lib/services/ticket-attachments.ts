import { nanoid } from "nanoid";
import { ValidationError } from "@foundry/commons";
import { filesSecuredAccess, filesService, securedFilesService } from "@/lib/files";
import type { Attachment } from "@/db/schema";
import { sniffUploadImage } from "@/lib/images/validate";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;
const HREF_TTL_SECONDS = 3600;

const files = (entries: FormDataEntryValue[]): File[] =>
  entries.filter((e): e is File => e instanceof File && e.size > 0);
const safe = (name: string): string => name.replace(/[^\w.\-]+/g, "_") || "image";
const bytesOf = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

/** Upload each reply image as a secured original + a static thumbnail. */
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

  const checked = [];
  for (let i = 0; i < origs.length; i++) {
    const orig = origs[i];
    const thumb = thumbs[i];
    if (orig.size > MAX_BYTES) throw new ValidationError("Each image must be 5 MB or smaller");
    if (thumb.size > MAX_BYTES) throw new ValidationError("Bad thumbnail");
    const origBytes = await bytesOf(orig);
    const thumbBytes = await bytesOf(thumb);
    const origType = sniffUploadImage(origBytes);
    const thumbType = sniffUploadImage(thumbBytes);
    if (!origType) throw new ValidationError("Only PNG, JPEG, WebP or GIF images are allowed");
    if (!thumbType) throw new ValidationError("Bad thumbnail");
    checked.push({ name: orig.name, thumbName: thumb.name, origBytes, thumbBytes, origType, thumbType });
  }

  const out: Attachment[] = [];
  for (const c of checked) {
    const base = `tickets/${ticketId}/${nanoid()}`;
    const origDetail = await securedFilesService().create(`${base}/orig-${safe(c.name)}`, c.origBytes, {
      contentType: c.origType,
    });
    const thumbDetail = await filesService().create(`${base}/thumb-${safe(c.thumbName)}`, c.thumbBytes, {
      contentType: c.thumbType,
    });
    out.push({ path: origDetail.filePath, thumbUrl: thumbDetail.url ?? thumbDetail.filePath, name: c.name });
  }
  return out;
}

export async function attachmentHref(a: Attachment): Promise<string> {
  const { accessKey } = await filesSecuredAccess.mint(a.path, { ttlSeconds: HREF_TTL_SECONDS, limit: 20 });
  return `/api/files/${a.path}?ak=${accessKey}`;
}
