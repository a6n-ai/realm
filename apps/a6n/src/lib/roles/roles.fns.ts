import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { refusing } from "../auth/actor";
import { depsFor } from "../deps";
import { read, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { roleNameSchema, roleSchema } from "./schemas";
import { createRolesService } from "./service";

const svc = (organizationId: string) => createRolesService(depsFor(env).db, organizationId);

export const listRolesFn = createServerFn({ method: "GET" }).handler(() =>
  read("ac:read", async (actor) => ({
    roles: await svc(actor.organizationId).list(),
    mine: actor.permissions,
    canCreate: actor.permissions.includes("ac:create"),
    canUpdate: actor.permissions.includes("ac:update"),
    canDelete: actor.permissions.includes("ac:delete"),
  })),
);

export const createRoleFn = createServerFn({ method: "POST" })
  .validator(validate(roleSchema))
  .handler(({ data }) =>
    refusing(env, getRequestHeaders(), WRITE("ac:create"), (actor) => svc(actor.organizationId).create(data.name, data.permissions, actor)),
  );

export const updateRoleFn = createServerFn({ method: "POST" })
  .validator(validate(roleSchema))
  .handler(({ data }) =>
    refusing(env, getRequestHeaders(), WRITE("ac:update"), (actor) => svc(actor.organizationId).update(data.name, data.permissions, actor)),
  );

export const deleteRoleFn = createServerFn({ method: "POST" })
  .validator(validate(roleNameSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("ac:delete"), (actor) => svc(actor.organizationId).remove(data.name, actor)));
