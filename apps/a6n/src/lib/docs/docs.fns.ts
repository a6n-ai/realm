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
  runDuplicateDoc,
  runEmptyTrash,
  runRestoreDoc,
  runSetKind,
  runTrashDoc,
  runRemoveMember,
  runRenameDoc,
  runRevokeDocShare,
  runSetDocDefaultTtl,
  runSetDocShareExpiry,
  runSetMember,
} from "./actions-core";
import { createDocsLibrary } from "./library";
import { createDocSchema, emptyTrashSchema, memberSchema, renameDocSchema, setKindSchema, setMemberSchema } from "./schemas";
import { createDocsService } from "./service";

const MEMBER_WRITE = { write: true };

const service = (actor: { organizationId: string; userId: string }) => {
  const deps = depsFor(env);
  return createDocsService(deps.db, actor.organizationId, actor.userId, deps.rooms);
};

export const libraryFn = createServerFn({ method: "GET" }).handler(() =>
  readAny((actor) => {
    const deps = depsFor(env);
    return createDocsLibrary(deps.db, actor, deps.rooms, deps.archive).list();
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

export const setDocKindFn = createServerFn({ method: "POST" })
  .validator(validate(setKindSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runSetKind(actor, depsFor(env), data)));

export const duplicateDocFn = createServerFn({ method: "POST" })
  .validator(validate(docIdSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runDuplicateDoc(actor, depsFor(env), data)));

export const trashDocFn = createServerFn({ method: "POST" })
  .validator(validate(docIdSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runTrashDoc(actor, depsFor(env), data)));

export const restoreDocFn = createServerFn({ method: "POST" })
  .validator(validate(docIdSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runRestoreDoc(actor, depsFor(env), data)));

export const emptyTrashFn = createServerFn({ method: "POST" })
  .validator(validate(emptyTrashSchema))
  .handler(({ data }) => refusing(MEMBER_WRITE, (actor) => runEmptyTrash(actor, depsFor(env), data)));
