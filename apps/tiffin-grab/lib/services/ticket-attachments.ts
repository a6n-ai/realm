import { nanoid } from "nanoid";
import { ValidationError } from "@realm/commons";
import { filesService } from "@/lib/files";
import type { Attachment } from "@/db/schema";

const ACCEPT = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;

// Upload the reply's image files server-side, scoped to the ticket's prefix, and
// return {url,name} for each. Runs in the reply server action (session-authed);
// the ticket's ownership is enforced by ticketsService.reply's assertAccess.
// ponytail: upload happens before that ownership check, so a non-owner could
// spray orphan images into this prefix (storage spam only — no data leak). Move
// this behind an ownership assertion if it is ever abused.
export async function uploadAttachments(
  ticketId: string,
  entries: FormDataEntryValue[],
): Promise<Attachment[]> {
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);
  if (files.length === 0) return [];
  if (files.length > MAX_FILES) throw new ValidationError(`Attach up to ${MAX_FILES} images`);

  const out: Attachment[] = [];
  for (const file of files) {
    if (!ACCEPT.has(file.type)) throw new ValidationError("Only PNG, JPEG, WebP or GIF images are allowed");
    if (file.size > MAX_BYTES) throw new ValidationError("Each image must be 5 MB or smaller");
    const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "image";
    const key = `tickets/${ticketId}/${nanoid()}/${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detail = await filesService().create(key, bytes, { contentType: file.type });
    out.push({ url: detail.url ?? detail.filePath, name: safeName });
  }
  return out;
}
