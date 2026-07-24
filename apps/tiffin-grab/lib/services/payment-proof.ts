import { nanoid } from "nanoid";
import { ValidationError } from "@realm/commons";
import { filesService, securedFilesService } from "@/lib/files";
import type { PaymentProof } from "@/db/schema";

const ACCEPT = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

const asFile = (entry: FormDataEntryValue | null): File | null =>
  entry instanceof File && entry.size > 0 ? entry : null;

const safe = (name: string): string => name.replace(/[^\w.\-]+/g, "_") || "image";
const bytesOf = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

// One proof image for a payment claim: secured original + public thumbnail
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

  if (!ACCEPT.has(orig.type)) throw new ValidationError("Only PNG, JPEG, WebP or GIF images are allowed");
  if (orig.size > MAX_BYTES) throw new ValidationError("Screenshot must be 5 MB or smaller");
  if (!ACCEPT.has(thumb.type) || thumb.size > MAX_BYTES) throw new ValidationError("Bad thumbnail");

  const base = `payments/${paymentPublicId}/${nanoid()}`;
  const origDetail = await securedFilesService().create(
    `${base}/orig-${safe(orig.name)}`,
    await bytesOf(orig),
    { contentType: orig.type },
  );
  const thumbDetail = await filesService().create(
    `${base}/thumb-${safe(thumb.name)}`,
    await bytesOf(thumb),
    { contentType: thumb.type },
  );
  return {
    path: origDetail.filePath,
    thumbUrl: thumbDetail.url ?? thumbDetail.filePath,
    name: orig.name,
  };
}
