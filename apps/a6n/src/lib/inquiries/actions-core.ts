import type { z } from "zod";
import type { Actor } from "../auth/actor";
import { allows, type Permission } from "../auth/permissions";
import type { Deps } from "../deps";
import {
  addActivitySchema,
  assignSchema,
  changeStageSchema,
  claimSchema,
  createInquirySchema,
  reopenSchema,
  setFollowUpSchema,
  updateContactSchema,
} from "./schemas";
import { createInquiriesService, type Refusal } from "./service";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; code: string };

const forbidden = { ok: false, code: "forbidden" } as const;
const invalid = { ok: false, code: "invalid" } as const;

// Permission first, then the schema, then the service: every expected failure is a result, never a throw.
function action<S extends z.ZodType, T = unknown>(
  permission: Permission,
  schema: S,
  run: (data: z.output<S>, actor: Actor, deps: Deps) => Promise<({ ok: true } & T) | Refusal>,
) {
  return async (actor: Actor, deps: Deps, input: unknown): Promise<ActionResult<T>> => {
    if (!allows(actor.role, permission)) return forbidden;
    const parsed = schema.safeParse(input);
    if (!parsed.success) return invalid;
    return run(parsed.data, actor, deps);
  };
}

const svc = (deps: Deps) => createInquiriesService(deps.db);

export const runCreateInquiry = action<typeof createInquirySchema, { id: string }>(
  "inquiry:create",
  createInquirySchema,
  async (d, actor, deps) => {
    const res = await svc(deps).ingest(
      {
        source: d.source,
        subSource: d.subSource,
        contact: { name: d.contactName, phone: d.phone, email: d.email },
        company: d.company,
        requirements: d.requirements,
        ownerId: actor.userId,
        nextFollowUpAt: d.nextFollowUpAt,
        createdVia: "manual",
      },
      actor,
    );
    return res.ok ? { ok: true, id: res.inquiry.id } : res;
  },
);

export const runChangeStage = action("inquiry:update", changeStageSchema, (d, actor, deps) =>
  svc(deps).changeStage(d.id, d.from, d.to, { lostReason: d.lostReason }, actor),
);

export const runReopen = action("inquiry:update", reopenSchema, (d, actor, deps) =>
  svc(deps).reopen(d.id, d.stage, d.nextFollowUpAt, actor),
);

export const runAddActivity = action("inquiry:note", addActivitySchema, (d, actor, deps) =>
  svc(deps).addActivity(d.id, { type: d.type, note: d.note }, actor),
);

export const runSetFollowUp = action("inquiry:update", setFollowUpSchema, (d, actor, deps) =>
  svc(deps).setFollowUp(d.id, d.at, actor),
);

export const runClaim = action("inquiry:claim", claimSchema, (d, actor, deps) => svc(deps).claim(d.id, actor));

export const runAssign = action("inquiry:assign", assignSchema, (d, actor, deps) =>
  svc(deps).assign(d.id, d.fromOwnerId, d.toOwnerId, actor),
);

export const runUpdateContact = action("inquiry:update", updateContactSchema, (d, actor, deps) => {
  const { id, ...patch } = d;
  return svc(deps).updateContact(id, patch, actor);
});
