import { ValidationError } from "@foundry/commons";
import { storeImageUpload, validatedImageUpload } from "@/lib/files/validated-image-upload";
import type { PaymentProof } from "@/db/schema";

const asFile = (entry: FormDataEntryValue | null): File | null =>
  entry instanceof File && entry.size > 0 ? entry : null;

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

  const checked = await validatedImageUpload(orig, thumb, "Screenshot must be 5 MB or smaller");
  return storeImageUpload(`payments/${paymentPublicId}`, checked);
}
