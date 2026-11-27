import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { refusing } from "../auth/actor";
import { depsFor } from "../deps";
import { read, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { runInvite, runRemove, runResendInvite } from "./actions-core";
import { inviteSchema, memberIdSchema } from "./schemas";
import { createTeamService } from "./service";

const service = () => {
  const d = depsFor(env);
  return createTeamService(d.db, d.mailer, d.authUrl);
};

// Null without team:manage, so invite statuses never reach a sales user.
export const listTeamFn = createServerFn({ method: "GET" }).handler(() =>
  read("team:manage", async () => {
    const svc = service();
    const members = await svc.list();
    const statuses = await svc.inviteStatuses(members.filter((m) => m.latestInvite).map((m) => m.id));
    return { members: members.map((m) => ({ ...m, inviteLink: svc.pendingLink(m) })), statuses };
  }),
);

export const inviteFn = createServerFn({ method: "POST" })
  .validator(validate(inviteSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("team:manage"), (actor) => runInvite(actor, depsFor(env), data)));

export const resendInviteFn = createServerFn({ method: "POST" })
  .validator(validate(memberIdSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("team:manage"), (actor) => runResendInvite(actor, depsFor(env), data)));

export const removeFn = createServerFn({ method: "POST" })
  .validator(validate(memberIdSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("team:manage"), (actor) => runRemove(actor, depsFor(env), data)));
