import { nanoid } from "nanoid";
import { ValidationError } from "@foundry/commons";
import { AuthError, ForbiddenError } from "@foundry/commons";
import { filesSecuredAccess, securedFilesService } from "@/lib/files";
import { protectThumbnail } from "@/lib/files/protect-thumbnail";
import { requirePermission } from "@/lib/auth/guards";
import type { Attachment } from "@/db/schema";
import { sniffUploadImage } from "@/lib/images/validate";

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

  // Check every file before storing any, so one bad photo leaves no orphans. Judge the
  // bytes, not File.type (that only reflects the file name).
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
    const prot = await protectThumbnail(thumbBytes, thumbType);
    checked.push({ name: orig.name, thumbName: thumb.name, origBytes, thumbBytes: prot.bytes, origType, thumbType: prot.contentType });
  }

  const out: Attachment[] = [];
  for (const c of checked) {
    const base = `tickets/${ticketId}/${nanoid()}`;
    const origDetail = await securedFilesService().create(`${base}/orig-${safe(c.name)}`, c.origBytes, { contentType: c.origType });
    const thumbDetail = await securedFilesService().create(`${base}/thumb-${safe(c.thumbName)}`, c.thumbBytes, { contentType: c.thumbType });
    out.push({ path: origDetail.filePath, thumbPath: thumbDetail.filePath, name: c.name });
  }
  return out;
}

type Stored = { path: string; thumbPath?: string; thumbUrl?: string; name: string };
export type AttachmentView = { name: string; href: string; thumbUrl: string };
type Linker = (path: string) => string;

// An entity folder is exactly `tickets/<id>` or `payments/<id>`, never a bare prefix.
const ENTITY_FOLDER = /^(tickets|payments)\/[^/]+$/;
const dirname = (p: string): string => p.slice(0, p.lastIndexOf("/"));

async function canBulkAccess(): Promise<boolean> {
  try {
    await requirePermission({ files: ["bulkAccess"] });
    return true;
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof AuthError) return false;
    throw e;
  }
}

// ONE token for a whole ticket/payment folder; the limit scales with the files the
// view renders (2 per attachment for original + thumbnail, +10 slack for reloads
// of an <img>) and the short TTL bounds the rest. Permission-gated: a folder token
// opens every file of the entity, so only roles holding files.bulkAccess get one.
// Note: one token for an arbitrary list of paths would need a DB column change.
export async function mintFolderAccess(folder: string, fileCount: number): Promise<Linker> {
  await requirePermission({ files: ["bulkAccess"] });
  if (!ENTITY_FOLDER.test(folder)) throw new Error(`Not an entity folder: ${folder}`);
  const { accessKey } = await filesSecuredAccess.mint(folder, { ttlSeconds: HREF_TTL_SECONDS, limit: 2 * fileCount + 10 });
  return (path) => `/api/files/${path}?ak=${accessKey}`;
}

// Links for the attachments one viewer sees of ONE entity. Bulk-permitted viewers get a
// single folder token; everyone else gets one token per attachment folder (covering the
// original and its thumbnail). Called at render for a viewer who already passed access
// checks. ponytail: add a periodic prune of expired files_secured_access_key rows if it grows.
export async function attachmentLinks(entityFolder: string, files: Stored[]): Promise<(a: Stored) => AttachmentView> {
  const links = new Map<string, Linker>();
  if (files.length) {
    if (await canBulkAccess()) {
      const link = await mintFolderAccess(entityFolder, files.length);
      for (const f of files) links.set(f.path, link);
    } else {
      await Promise.all(
        files.map(async (f) => {
          const { accessKey } = await filesSecuredAccess.mint(dirname(f.path), { ttlSeconds: HREF_TTL_SECONDS, limit: 40 });
          links.set(f.path, (path) => `/api/files/${path}?ak=${accessKey}`);
        }),
      );
    }
  }
  return (a) => {
    const link = links.get(a.path);
    if (!link) throw new Error("attachmentLinks: file was not in the minted set");
    return { name: a.name, href: link(a.path), thumbUrl: a.thumbPath ? link(a.thumbPath) : (a.thumbUrl ?? link(a.path)) };
  };
}

// `payments/<id>/<nanoid>/orig-x` -> `payments/<id>`.
export const entityFolderOf = (path: string): string => path.split("/").slice(0, 2).join("/");

export async function proofView(proof: Stored | null): Promise<AttachmentView | null> {
  if (!proof) return null;
  return (await attachmentLinks(entityFolderOf(proof.path), [proof]))(proof);
}

// One ticket's messages: every attachment linked off a single mint (bulk) or per attachment.
export async function withAttachmentViews<M extends { attachments: Stored[] | null }>(
  messages: M[],
): Promise<(Omit<M, "attachments"> & { attachments: AttachmentView[] | null })[]> {
  const all = messages.flatMap((m) => m.attachments ?? []);
  const view = all.length ? await attachmentLinks(entityFolderOf(all[0].path), all) : null;
  return messages.map((m) => ({ ...m, attachments: m.attachments && view ? m.attachments.map(view) : null }));
}
