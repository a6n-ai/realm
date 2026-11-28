import type { z } from "zod";
import type { Actor } from "../auth/actor";
import type { Deps } from "../deps";
import { gate, type ActionResult } from "../inquiries/actions-core";
import { createShareSchema, defaultTtlSchema, shareExpirySchema, shareIdSchema, startDocSchema } from "./schemas";
import { createMeetingDocsService, type Refusal } from "./service";

type Service = ReturnType<typeof createMeetingDocsService>;

function action<S extends z.ZodType, T = unknown>(
  schema: S,
  run: (data: z.output<S>, service: Service, actor: Actor, deps: Deps) => Promise<({ ok: true } & T) | Refusal>,
) {
  return async (actor: Actor, deps: Deps, input: unknown): Promise<ActionResult<T>> => {
    const checked = gate("inquiry:update", schema, actor, input);
    if ("refusal" in checked) return checked.refusal;
    return run(checked.data, createMeetingDocsService(deps.db, actor.organizationId, deps.rooms), actor, deps);
  };
}

export const runStartDoc = action<typeof startDocSchema, { id: string }>(startDocSchema, (d, service, actor) =>
  service.start(d.inquiryId, d.localDate, actor),
);

export const runCreateShare = action<typeof createShareSchema, { shareId: string; url: string }>(
  createShareSchema,
  async (d, service, actor, deps) => {
    const res = await service.createShare(d.docId, d, actor);
    return res.ok ? { ok: true, shareId: res.shareId, url: `${deps.authUrl}/m/${res.token}` } : res;
  },
);

export const runSetShareExpiry = action(shareExpirySchema, (d, service, actor) => service.setShareExpiry(d.shareId, d.expiresAt, actor));

export const runRevokeShare = action(shareIdSchema, (d, service, actor) => service.revokeShare(d.shareId, actor));

export const runSetDefaultTtl = action(defaultTtlSchema, (d, service, actor) => service.setDefaultTtl(d.docId, d.seconds, actor));
