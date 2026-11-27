import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { ConsoleError, requirePlatformAdmin, toResponseError } from "../auth/actor";
import { createAuth } from "../auth";
import { depsFor } from "../deps";
import { validate } from "../schemas";
import { addOwnerSchema, createOrgSchema, renameOrgSchema, setActiveOrgSchema } from "./schemas";
import { createPlatformService } from "./service";

const svc = () => {
  const d = depsFor(env);
  return createPlatformService(d.db, d.mailer, d.authUrl);
};

// Not a super admin: null, and the page shows nothing about organisations.
async function platform<T>(write: boolean, run: (admin: { userId: string; name: string }) => Promise<T>): Promise<T | null> {
  try {
    return await run(await requirePlatformAdmin(env, getRequestHeaders(), { write }));
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 404) return null;
    return toResponseError(err);
  }
}

export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(() => platform(false, () => svc().listOrganizations()));

export const createOrganizationFn = createServerFn({ method: "POST" })
  .validator(validate(createOrgSchema))
  .handler(({ data }) => platform(true, (admin) => svc().createOrganization(data, admin)));

export const renameOrganizationFn = createServerFn({ method: "POST" })
  .validator(validate(renameOrgSchema))
  .handler(({ data }) => platform(true, (admin) => svc().renameOrganization(data.id, data.name, admin)));

export const addOwnerFn = createServerFn({ method: "POST" })
  .validator(validate(addOwnerSchema))
  .handler(({ data }) => platform(true, (admin) => svc().addOwner(data.id, { email: data.email, name: data.name }, admin)));

// The switcher: Better Auth checks the membership before it moves the session.
export const setActiveOrganizationFn = createServerFn({ method: "POST" })
  .validator(validate(setActiveOrgSchema))
  .handler(async ({ data }) => {
    try {
      await (await createAuth(env)).api.setActiveOrganization({ headers: getRequestHeaders(), body: { organizationId: data.organizationId } });
      return { ok: true as const };
    } catch {
      return { ok: false as const, code: "not_found" as const };
    }
  });
