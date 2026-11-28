import type { z } from "zod";
import type { Actor } from "../auth/actor";
import type { Deps } from "../deps";
import type { ActionResult } from "../inquiries/actions-core";
import { createShareSchema, defaultTtlSchema, docIdSchema, shareExpirySchema, shareIdSchema } from "../meeting-docs/schemas";
import type { Refusal } from "../meeting-docs/service";
import { createDocSchema, memberSchema, renameDocSchema, setMemberSchema } from "./schemas";
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

export const runCreateDoc = action<typeof createDocSchema, { id: string }>(createDocSchema, (_d, service, actor) => service.create(actor));
export const runRenameDoc = action(renameDocSchema, (d, service, actor) => service.rename(d.docId, d.title, actor));
export const runDeleteDoc = action(docIdSchema, (d, service) => service.remove(d.docId));
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
