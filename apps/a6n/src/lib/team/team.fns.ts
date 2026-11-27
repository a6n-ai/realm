import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { refusing } from "../auth/actor";
import { depsFor } from "../deps";
import { read, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { runChangeRole, runInvite, runRemove, runResendInvite } from "./actions-core";
import { changeRoleSchema, inviteSchema, memberIdSchema } from "./schemas";
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
    };
  }),
);

export const inviteFn = createServerFn({ method: "POST" })
  .validator(validate(inviteSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("invitation:create"), (actor) => runInvite(actor, depsFor(env), data)));

export const resendInviteFn = createServerFn({ method: "POST" })
  .validator(validate(memberIdSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("invitation:create"), (actor) => runResendInvite(actor, depsFor(env), data)));

export const removeFn = createServerFn({ method: "POST" })
  .validator(validate(memberIdSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("member:delete"), (actor) => runRemove(actor, depsFor(env), data)));

export const changeRoleFn = createServerFn({ method: "POST" })
  .validator(validate(changeRoleSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("member:update"), (actor) => runChangeRole(actor, depsFor(env), data)));
