import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { depsFor } from "../deps";
import { read, refusing, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { createTeamSchema, renameTeamSchema, teamIdSchema, teamMemberSchema } from "./schemas";
import { createTeamsService } from "./service";

const svc = (organizationId: string) => createTeamsService(depsFor(env).db, organizationId);

export const listTeamsFn = createServerFn({ method: "GET" }).handler(() =>
  read("team:update", async (actor) => ({
    teams: await svc(actor.organizationId).list(),
    // Who can be added: the organisation's active members.
    people: await depsFor(env).db.all<{ id: string; name: string }>(sql`SELECT u.id, u.name FROM members m
      JOIN users u ON u.id = m.user_id WHERE m.organization_id = ${actor.organizationId} AND u.status = 'active' ORDER BY u.name`),
    canCreate: actor.permissions.includes("team:create"),
    canDelete: actor.permissions.includes("team:delete"),
  })),
);

export const createTeamFn = createServerFn({ method: "POST" })
  .validator(validate(createTeamSchema))
  .handler(({ data }) => refusing(WRITE("team:create"), (actor) => svc(actor.organizationId).create(data.name, actor)));

export const renameTeamFn = createServerFn({ method: "POST" })
  .validator(validate(renameTeamSchema))
  .handler(({ data }) => refusing(WRITE("team:update"), (actor) => svc(actor.organizationId).rename(data.id, data.name, actor)));

export const deleteTeamFn = createServerFn({ method: "POST" })
  .validator(validate(teamIdSchema))
  .handler(({ data }) => refusing(WRITE("team:delete"), (actor) => svc(actor.organizationId).remove(data.id, actor)));

export const addTeamMemberFn = createServerFn({ method: "POST" })
  .validator(validate(teamMemberSchema))
  .handler(({ data }) =>
    refusing(WRITE("team:update"), (actor) => svc(actor.organizationId).addMember(data.teamId, data.userId, actor)),
  );

export const removeTeamMemberFn = createServerFn({ method: "POST" })
  .validator(validate(teamMemberSchema))
  .handler(({ data }) =>
    refusing(WRITE("team:update"), (actor) => svc(actor.organizationId).removeMember(data.teamId, data.userId, actor)),
  );
