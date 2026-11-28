import type { z } from "zod";
import type { Actor } from "../auth/actor";
import type { Deps } from "../deps";
import type { ActionResult } from "../inquiries/actions-core";
import { createShareSchema, defaultTtlSchema, docIdSchema, shareExpirySchema, shareIdSchema } from "../meeting-docs/schemas";
import type { Refusal } from "../meeting-docs/service";
import { createDocsLibrary } from "./library";
import { createDocSchema, emptyTrashSchema, memberSchema, renameDocSchema, setKindSchema, setMemberSchema } from "./schemas";
import { createDocsService } from "./service";

type Service = ReturnType<typeof createDocsService>;

// No permission gate: every member has Docs. The service decides by ownership.
function action<S extends z.ZodType, T = unknown>(
  schema: S,
  run: (data: z.output<S>, service: Service, actor: Actor, deps: Deps) => Promise<({ ok: true } & T) | Refusal>,
) {
  return async (actor: Actor, deps: Deps, input: unknown): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "invalid" };
    return run(parsed.data, createDocsService(deps.db, actor.organizationId, actor.userId, deps.rooms), actor, deps);
  };
}

// Listing actions, for own docs and inquiry docs alike: the library holds the rule for each.
function libraryAction<S extends z.ZodType, T = unknown>(
  schema: S,
  run: (data: z.output<S>, library: ReturnType<typeof createDocsLibrary>) => Promise<({ ok: true } & T) | Refusal>,
) {
  return async (actor: Actor, deps: Deps, input: unknown): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "invalid" };
    return run(parsed.data, createDocsLibrary(deps.db, actor, deps.rooms, deps.archive));
  };
}

export const runCreateDoc = action<typeof createDocSchema, { id: string }>(createDocSchema, (d, service, actor) => service.create(actor, d.kind));
export const runRenameDoc = libraryAction(renameDocSchema, (d, library) => library.rename(d.docId, d.title));
export const runSetKind = libraryAction(setKindSchema, (d, library) => library.setKind(d.docId, d.kind));
export const runDuplicateDoc = libraryAction<typeof docIdSchema, { id: string }>(docIdSchema, (d, library) => library.duplicate(d.docId));
export const runTrashDoc = libraryAction(docIdSchema, (d, library) => library.trash(d.docId));
export const runRestoreDoc = libraryAction(docIdSchema, (d, library) => library.restore(d.docId));
export const runDeleteDoc = libraryAction(docIdSchema, (d, library) => library.deleteForever(d.docId));
export const runEmptyTrash = libraryAction<typeof emptyTrashSchema, { count: number }>(emptyTrashSchema, (_d, library) => library.emptyTrash());
export const runSetMember = action(setMemberSchema, (d, service, actor) => service.setMember(d.docId, d.userId, d.mode, actor));
export const runRemoveMember = action(memberSchema, (d, service) => service.removeMember(d.docId, d.userId));
export const runCreateDocShare = action<typeof createShareSchema, { shareId: string; url: string }>(
  createShareSchema,
  async (d, service, actor, deps) => {
    const res = await service.links.createShare(d.docId, d, actor);
    return res.ok ? { ok: true, shareId: res.shareId, url: `${deps.authUrl}/m/${res.token}` } : res;
  },
);
export const runSetDocShareExpiry = action(shareExpirySchema, (d, service, actor) => service.links.setShareExpiry(d.shareId, d.expiresAt, actor));
export const runRevokeDocShare = action(shareIdSchema, (d, service, actor) => service.links.revokeShare(d.shareId, actor));
export const runSetDocDefaultTtl = action(defaultTtlSchema, (d, service, actor) => service.links.setDefaultTtl(d.docId, d.seconds, actor));
