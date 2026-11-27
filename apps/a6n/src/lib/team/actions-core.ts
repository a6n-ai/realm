import type { Actor } from "../auth/actor";
import type { Deps } from "../deps";
import { gate, type ActionResult } from "../inquiries/actions-core";
import { changeRoleSchema, inviteSchema, memberIdSchema } from "./schemas";
import { createTeamService, type SendRefusal } from "./service";

const svc = (deps: Deps, actor: Actor) => createTeamService(deps.db, actor.organizationId, deps.mailer, deps.authUrl);

export type InviteOutcome = ActionResult<{ sent: boolean; inviteLink: string; reason?: SendRefusal }>;

export async function runInvite(actor: Actor, deps: Deps, input: unknown): Promise<InviteOutcome> {
  const g = gate("invitation:create", inviteSchema, actor, input);
  return "refusal" in g ? g.refusal : svc(deps, actor).invite(g.data, actor);
}

export async function runResendInvite(actor: Actor, deps: Deps, input: unknown): Promise<InviteOutcome> {
  const g = gate("invitation:create", memberIdSchema, actor, input);
  return "refusal" in g ? g.refusal : svc(deps, actor).resendInvite(g.data.id, actor);
}

export async function runRemove(actor: Actor, deps: Deps, input: unknown): Promise<ActionResult> {
  const g = gate("member:delete", memberIdSchema, actor, input);
  if ("refusal" in g) return g.refusal;
  const res = await svc(deps, actor).remove(g.data.id, actor);
  return res.removed ? { ok: true } : { ok: false, code: res.reason };
}

export async function runChangeRole(actor: Actor, deps: Deps, input: unknown): Promise<ActionResult> {
  const g = gate("member:update", changeRoleSchema, actor, input);
  if ("refusal" in g) return g.refusal;
  return svc(deps, actor).changeRole(g.data.id, g.data.role, actor);
}
