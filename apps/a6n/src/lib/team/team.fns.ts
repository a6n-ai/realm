import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { depsFor } from "../deps";
import { read, readAny, refusing, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { runChangeRole, runInvite, runRemove, runResendInvite, runSetManager } from "./actions-core";
import { changeRoleSchema, inviteSchema, memberIdSchema, setManagerSchema } from "./schemas";
import { canGrant, listOrgRoles } from "../auth/membership";
import { createTeamService } from "./service";

const service = (organizationId: string) => {
  const d = depsFor(env);
  return createTeamService(d.db, organizationId, d.mailer, d.authUrl);
};

// Null without invitation:create, so invite statuses never reach someone who cannot invite.
export const listTeamFn = createServerFn({ method: "GET" }).handler(() =>
  read("invitation:create", async (actor) => {
    const svc = service(actor.organizationId);
    const members = await svc.list();
    const statuses = await svc.inviteStatuses(members.filter((m) => m.latestInvite).map((m) => m.id));
    // Only roles the viewer could hand out appear in the pickers; the server re-checks on every change.
    const roles = (await listOrgRoles(depsFor(env).db, actor.organizationId))
      .filter((r) => canGrant(actor.permissions, r.permissions))
      .map((r) => ({ name: r.name, builtIn: r.builtIn }));
    return {
      members: members.map((m) => ({ ...m, inviteLink: svc.pendingLink(m) })),
      statuses,
      roles,
      canChangeRoles: actor.permissions.includes("member:update"),
      canRemove: actor.permissions.includes("member:delete"),
      canSetManager: actor.permissions.includes("member:update"),
    };
  }),
);

export const inviteFn = createServerFn({ method: "POST" })
  .validator(validate(inviteSchema))
  .handler(({ data }) => refusing(WRITE("invitation:create"), (actor) => runInvite(actor, depsFor(env), data)));

export const resendInviteFn = createServerFn({ method: "POST" })
  .validator(validate(memberIdSchema))
  .handler(({ data }) => refusing(WRITE("invitation:create"), (actor) => runResendInvite(actor, depsFor(env), data)));

export const removeFn = createServerFn({ method: "POST" })
  .validator(validate(memberIdSchema))
  .handler(({ data }) => refusing(WRITE("member:delete"), (actor) => runRemove(actor, depsFor(env), data)));

export const changeRoleFn = createServerFn({ method: "POST" })
  .validator(validate(changeRoleSchema))
  .handler(({ data }) => refusing(WRITE("member:update"), (actor) => runChangeRole(actor, depsFor(env), data)));

export const setManagerFn = createServerFn({ method: "POST" })
  .validator(validate(setManagerSchema))
  .handler(({ data }) => refusing(WRITE("member:update"), (actor) => runSetManager(actor, depsFor(env), data)));

// Names, roles and teams only, never emails: every member may view it.
export const orgChartFn = createServerFn({ method: "GET" }).handler(() =>
  readAny((actor) => service(actor.organizationId).orgChart()),
);
