import { nanoid } from "nanoid";
import { AuthError, ForbiddenError, ValidationError } from "@foundry/commons";
import { filesSecuredAccess, securedFilesService } from "@/lib/files";
import { protectThumbnail } from "@/lib/files/protect-thumbnail";
import { requirePermission } from "@/lib/auth/guards";
import type { Attachment } from "@/db/schema";
import { sniffUploadImage } from "@foundry/commons/util/image-sniff";

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
export type AttachmentView = { name: string; href: string; thumbUrl: string | null };
type Linker = (path: string) => string;

// Shown where the shared chat UI needs an image src but the row has no thumbnail.
export const NO_THUMB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23ccc'/%3E%3C/svg%3E";

// An entity folder is exactly `tickets/<id>` or `payments/<id>`, never a bare prefix;
// an attachment folder adds the upload's nanoid.
const ENTITY_FOLDER = /^(tickets|payments)\/[^/]+$/;
const ATTACHMENT_FOLDER = /^(tickets|payments)\/[^/]+\/[^/]+$/;
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

// Links for the attachments one viewer sees of ONE entity. `folders` are the entity folders
// the caller access-checked (a payment proof may live under its payment id or, for add-ons,
// its order id); a file outside them gets no link. Bulk-permitted viewers get one folder
// token per folder used; everyone else one token per attachment folder (original +
// thumbnail). ponytail: add a periodic prune of expired files_secured_access_key rows if it grows.
export async function attachmentLinks(folders: string | string[], files: Stored[]): Promise<(a: Stored) => AttachmentView | null> {
  const allowed = [folders].flat();
  const links = new Map<string, Linker>();
  const folderOf = (f: Stored): string | undefined => allowed.find((d) => f.path.startsWith(`${d}/`));
  const ok = files.filter((f) => {
    const good = folderOf(f) !== undefined && ATTACHMENT_FOLDER.test(dirname(f.path));
    if (!good) console.error("attachmentLinks: refusing to link", f.path);
    return good;
  });
  if (ok.length) {
    if (await canBulkAccess()) {
      for (const d of new Set(ok.map(folderOf) as string[])) {
        const mine = ok.filter((f) => folderOf(f) === d);
        const link = await mintFolderAccess(d, mine.length);
        for (const f of mine) links.set(f.path, link);
      }
    } else {
      await Promise.all(
        ok.map(async (f) => {
          const { accessKey } = await filesSecuredAccess.mint(dirname(f.path), { ttlSeconds: HREF_TTL_SECONDS, limit: 40 });
          links.set(f.path, (path) => `/api/files/${path}?ak=${accessKey}`);
        }),
      );
    }
  }
  return (a) => {
    const link = links.get(a.path);
    if (!link) return null;
    const thumbUrl = a.thumbPath && dirname(a.thumbPath) === dirname(a.path) ? link(a.thumbPath) : (a.thumbUrl ?? null);
    return { name: a.name, href: link(a.path), thumbUrl };
  };
}

export async function proofView(proof: Stored | null, folders: string | string[]): Promise<AttachmentView | null> {
  if (!proof) return null;
  return (await attachmentLinks(folders, [proof]))(proof);
}

// One ticket's messages (`ticketFolder` = `tickets/<ticketPublicId>`): every attachment
// linked off a single mint (bulk) or per attachment. Unlinkable attachments are dropped.
export async function withAttachmentViews<M extends { attachments: Stored[] | null }>(
  messages: M[],
  ticketFolder: string,
): Promise<(Omit<M, "attachments"> & { attachments: { name: string; href: string; thumbUrl: string }[] | null })[]> {
  const view = await attachmentLinks(ticketFolder, messages.flatMap((m) => m.attachments ?? []));
  return messages.map((m) => ({
    ...m,
    attachments: m.attachments
      ? m.attachments.flatMap((a) => {
          const v = view(a);
          return v ? [{ ...v, thumbUrl: v.thumbUrl ?? NO_THUMB }] : [];
        })
      : null,
  }));
}
