import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { depsFor } from "../deps";
import { open, read, refusing, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { readSecret } from "../secrets";
import { runCreateShare, runRevokeShare, runSetDefaultTtl, runSetShareExpiry, runStartDoc } from "./actions-core";
import { issueGuestRoomToken, issueStaffRoomToken } from "./room-token";
import {
  createShareSchema,
  defaultTtlSchema,
  docIdSchema,
  guestTokenSchema,
  listDocsSchema,
  openShareSchema,
  shareExpirySchema,
  shareIdSchema,
  startDocSchema,
} from "./schemas";
import { createMeetingDocsService } from "./service";
import { resolveShare } from "./share-link";

const service = (organizationId: string) => {
  const deps = depsFor(env);
  return createMeetingDocsService(deps.db, organizationId, deps.rooms);
};

async function collabSecret(): Promise<string> {
  const secret = await readSecret(env.COLLAB_SECRET);
  if (!secret) throw new Error("COLLAB_SECRET is not set");
  return secret;
}

export const listMeetingDocsFn = createServerFn({ method: "GET" })
  .validator(validate(listDocsSchema))
  .handler(({ data }) => read("inquiry:read", (actor) => service(actor.organizationId).listForInquiry(data.inquiryId)));

export const getMeetingDocFn = createServerFn({ method: "GET" })
  .validator(validate(docIdSchema))
  .handler(({ data }) =>
    read("inquiry:read", async (actor) => {
      const docs = service(actor.organizationId);
      const doc = await docs.get(data.docId);
      if (!doc) return { missing: true as const };
      const canEdit = actor.permissions.includes("inquiry:update");
      return {
        doc,
        // links are sharing management: without the permission they are not even read
        shares: canEdit ? await docs.listShares(data.docId) : [],
        canEdit,
        canShare: canEdit,
        viewer: { userId: actor.userId, name: actor.name },
      };
    }),
  );

export const listSharesFn = createServerFn({ method: "GET" })
  .validator(validate(docIdSchema))
  .handler(({ data }) => read("inquiry:update", (actor) => service(actor.organizationId).listShares(data.docId)));

export const startMeetingDocFn = createServerFn({ method: "POST" })
  .validator(validate(startDocSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runStartDoc(actor, depsFor(env), data)));

export const createShareFn = createServerFn({ method: "POST" })
  .validator(validate(createShareSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runCreateShare(actor, depsFor(env), data)));

export const setShareExpiryFn = createServerFn({ method: "POST" })
  .validator(validate(shareExpirySchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runSetShareExpiry(actor, depsFor(env), data)));

export const revokeShareFn = createServerFn({ method: "POST" })
  .validator(validate(shareIdSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runRevokeShare(actor, depsFor(env), data)));

export const setDefaultTtlFn = createServerFn({ method: "POST" })
  .validator(validate(defaultTtlSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runSetDefaultTtl(actor, depsFor(env), data)));

export const staffRoomTokenFn = createServerFn({ method: "POST" })
  .validator(validate(docIdSchema))
  .handler(({ data }) =>
    read("inquiry:read", async (actor) => issueStaffRoomToken(depsFor(env).db, await collabSecret(), actor, data.docId)),
  );

// The two below are public: the share token is the only credential.
export const openShareFn = createServerFn({ method: "GET" })
  .validator(validate(openShareSchema))
  .handler(({ data }) => open(() => resolveShare(depsFor(env).db, data.token)));

export const guestRoomTokenFn = createServerFn({ method: "POST" })
  .validator(validate(guestTokenSchema))
  .handler(({ data }) =>
    open(async () => {
      const ip = getRequestHeaders().get("cf-connecting-ip") ?? "unknown";
      const res = await issueGuestRoomToken(depsFor(env).db, await collabSecret(), { ...data, ip });
      if (!res.ok && res.code === "rate_limited") setResponseStatus(429);
      return res;
    }),
  );
