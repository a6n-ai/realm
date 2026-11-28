import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { depsFor } from "../deps";
import { readAny, refusing } from "../guarded.fns";
import { createShareSchema, defaultTtlSchema, docIdSchema, shareExpirySchema, shareIdSchema } from "../meeting-docs/schemas";
import { validate } from "../schemas";
import {
  runCreateDoc,
  runCreateDocShare,
  runDeleteDoc,
  runRemoveMember,
  runRenameDoc,
  runRevokeDocShare,
  runSetDocDefaultTtl,
  runSetDocShareExpiry,
  runSetMember,
} from "./actions-core";
import { createDocSchema, memberSchema, renameDocSchema, setMemberSchema } from "./schemas";
import { createDocsService } from "./service";

const MEMBER_WRITE = { write: true };

const service = (actor: { organizationId: string; userId: string }) => {
  const deps = depsFor(env);
  return createDocsService(deps.db, actor.organizationId, actor.userId, deps.rooms);
};

export const listDocsFn = createServerFn({ method: "GET" }).handler(() =>
  readAny(async (actor) => {
    const docs = service(actor);
    const [mine, shared] = await Promise.all([docs.listMine(), docs.listShared()]);
    return { mine, shared };
  }),
);

export const getDocFn = createServerFn({ method: "GET" })
  .validator(validate(docIdSchema))
  .handler(({ data }) =>
    readAny(async (actor) => {
      const docs = service(actor);
      const doc = await docs.get(data.docId);
      if (!doc) return { missing: true as const };
      // who else has access is the owner's business: otherwise it is not even read
      const owner = doc.access === "owner";
      return {
        doc,
        viewer: { userId: actor.userId, name: actor.name },
        members: owner ? await docs.members(data.docId) : null,
        shares: owner ? await docs.links.listShares(data.docId) : [],
      };
    }),
  );

export const createDocFn = createServerFn({ method: "POST" })
  .validator(validate(createDocSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runCreateDoc(actor, depsFor(env), data)));

export const renameDocFn = createServerFn({ method: "POST" })
  .validator(validate(renameDocSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runRenameDoc(actor, depsFor(env), data)));

export const deleteDocFn = createServerFn({ method: "POST" })
  .validator(validate(docIdSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runDeleteDoc(actor, depsFor(env), data)));

export const setMemberFn = createServerFn({ method: "POST" })
  .validator(validate(setMemberSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runSetMember(actor, depsFor(env), data)));

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(memberSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runRemoveMember(actor, depsFor(env), data)));

export const createDocShareFn = createServerFn({ method: "POST" })
  .validator(validate(createShareSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runCreateDocShare(actor, depsFor(env), data)));

export const setDocShareExpiryFn = createServerFn({ method: "POST" })
  .validator(validate(shareExpirySchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runSetDocShareExpiry(actor, depsFor(env), data)));

export const revokeDocShareFn = createServerFn({ method: "POST" })
  .validator(validate(shareIdSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runRevokeDocShare(actor, depsFor(env), data)));

export const setDocDefaultTtlFn = createServerFn({ method: "POST" })
  .validator(validate(defaultTtlSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runSetDocDefaultTtl(actor, depsFor(env), data)));
