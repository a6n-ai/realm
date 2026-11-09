import { nanoid } from "nanoid";
import { ValidationError } from "@foundry/commons";
import { sniffUploadImage } from "@foundry/commons/util/image-sniff";
import { securedFilesService } from "@/lib/files";
import { protectThumbnail } from "@/lib/files/protect-thumbnail";

const MAX_BYTES = 5 * 1024 * 1024;

const safe = (name: string): string => name.replace(/[^\w.\-]+/g, "_") || "image";
const bytesOf = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

export type ValidatedImage = {
  name: string;
  thumbName: string;
  origBytes: Uint8Array;
  origType: string;
  thumbBytes: Uint8Array;
  thumbType: string;
};

/** Size, sniff (the bytes, not File.type, which only reflects the file name) and protect the thumbnail. Stores nothing. */
export async function validatedImageUpload(orig: File, thumb: File, tooBigMessage: string): Promise<ValidatedImage> {
  if (orig.size > MAX_BYTES) throw new ValidationError(tooBigMessage);
  if (thumb.size > MAX_BYTES) throw new ValidationError("Bad thumbnail");
  const origBytes = await bytesOf(orig);
  const thumbBytes = await bytesOf(thumb);
  const origType = sniffUploadImage(origBytes);
  const thumbType = sniffUploadImage(thumbBytes);
  if (!origType) throw new ValidationError("Only PNG, JPEG, WebP or GIF images are allowed");
  if (!thumbType) throw new ValidationError("Bad thumbnail");
  const prot = await protectThumbnail(thumbBytes, thumbType);
  return { name: orig.name, thumbName: thumb.name, origBytes, origType, thumbBytes: prot.bytes, thumbType: prot.contentType };
}

/** Stores the secured original and thumbnail under `<folder>/<nanoid>/`. */
export async function storeImageUpload(folder: string, c: ValidatedImage): Promise<{ path: string; thumbPath: string; name: string }> {
  const base = `${folder}/${nanoid()}`;
  const origDetail = await securedFilesService().create(`${base}/orig-${safe(c.name)}`, c.origBytes, { contentType: c.origType });
  const thumbDetail = await securedFilesService().create(`${base}/thumb-${safe(c.thumbName)}`, c.thumbBytes, { contentType: c.thumbType });
  return { path: origDetail.filePath, thumbPath: thumbDetail.filePath, name: c.name };
}
