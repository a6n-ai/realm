import { nanoid } from "nanoid";
import { ValidationError } from "@foundry/commons";
import { securedFilesService } from "@/lib/files";
import { protectThumbnail } from "@/lib/files/protect-thumbnail";
import type { PaymentProof } from "@/db/schema";
import { sniffUploadImage } from "@foundry/commons/util/image-sniff";

const MAX_BYTES = 5 * 1024 * 1024;

const asFile = (entry: FormDataEntryValue | null): File | null =>
  entry instanceof File && entry.size > 0 ? entry : null;

const safe = (name: string): string => name.replace(/[^\w.\-]+/g, "_") || "image";
const bytesOf = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

// One proof image for a payment claim: secured original + secured blurred/watermarked thumbnail
// (same pairing as ticket attachments). Returns null when no file was attached.
export async function uploadPaymentProof(
  paymentPublicId: string,
  origEntry: FormDataEntryValue | null,
  thumbEntry: FormDataEntryValue | null,
): Promise<PaymentProof | null> {
  const orig = asFile(origEntry);
  if (!orig) return null;
  const thumb = asFile(thumbEntry);
  if (!thumb) throw new ValidationError("Payment screenshot thumbnail missing");

  if (orig.size > MAX_BYTES) throw new ValidationError("Screenshot must be 5 MB or smaller");
  if (thumb.size > MAX_BYTES) throw new ValidationError("Bad thumbnail");
  // Judge the bytes, not File.type (that only reflects the file name).
  const origBytes = await bytesOf(orig);
  const thumbBytes = await bytesOf(thumb);
  const origType = sniffUploadImage(origBytes);
  const thumbType = sniffUploadImage(thumbBytes);
  if (!origType) throw new ValidationError("Only PNG, JPEG, WebP or GIF images are allowed");
  if (!thumbType) throw new ValidationError("Bad thumbnail");

  const prot = await protectThumbnail(thumbBytes, thumbType);
  const base = `payments/${paymentPublicId}/${nanoid()}`;
  const origDetail = await securedFilesService().create(
    `${base}/orig-${safe(orig.name)}`,
    origBytes,
    { contentType: origType },
  );
  const thumbDetail = await securedFilesService().create(
    `${base}/thumb-${safe(thumb.name)}`,
    prot.bytes,
    { contentType: prot.contentType },
  );
  return {
    path: origDetail.filePath,
    thumbPath: thumbDetail.filePath,
    name: orig.name,
  };
}
