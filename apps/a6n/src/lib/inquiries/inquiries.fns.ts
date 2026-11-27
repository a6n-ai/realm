import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { ConsoleError, requireActor, toResponseError } from "../auth/actor";
import type { Permission } from "../auth/permissions";
import { depsFor } from "../deps";
import { validate } from "../schemas";
import {
  runAddActivity,
  runAssign,
  runChangeStage,
  runClaim,
  runCreateInquiry,
  runReopen,
  runSetFollowUp,
  runUpdateContact,
} from "./actions-core";
import { searchCompanies } from "./companies";
import { getInquiryDetail, listInquiriesPage, listOwners } from "./queries";
import {
  addActivitySchema,
  assignSchema,
  changeStageSchema,
  claimSchema,
  createInquirySchema,
  getInquirySchema,
  listInquiriesSchema,
  reopenSchema,
  searchCompaniesSchema,
  setFollowUpSchema,
  updateContactSchema,
} from "./schemas";
import { createSourcesService } from "./sources";

// A read the actor may not make is null, and the page renders DeniedState with status 200.
async function read<T>(permission: Permission, run: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<T>): Promise<T | null> {
  try {
    return await run(await requireActor(env, getRequestHeaders(), { permission }));
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 403) return null;
    return toResponseError(err);
  }
}

export const listInquiriesFn = createServerFn({ method: "GET" })
  .validator(validate(listInquiriesSchema))
  .handler(({ data }) => read("inquiry:read", (actor) => listInquiriesPage(depsFor(env).db, actor.userId, data)));

export const getInquiryFn = createServerFn({ method: "GET" })
  .validator(validate(getInquirySchema))
  .handler(({ data }) => read("inquiry:read", async () => (await getInquiryDetail(depsFor(env).db, data.id)) ?? { missing: true as const }));

export const searchCompaniesFn = createServerFn({ method: "GET" })
  .validator(validate(searchCompaniesSchema))
  .handler(({ data }) => read("inquiry:create", () => searchCompanies(depsFor(env).db, data.q)));

export const listActiveSourcesFn = createServerFn({ method: "GET" }).handler(() =>
  read("inquiry:read", () => createSourcesService(depsFor(env).db).listActive()),
);

export const listOwnersFn = createServerFn({ method: "GET" }).handler(() => read("inquiry:read", () => listOwners(depsFor(env).db)));

const WRITE = (permission: Permission) => ({ permission, write: true });

export const createInquiryFn = createServerFn({ method: "POST" })
  .validator(validate(createInquirySchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:create"));
      return await runCreateInquiry(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const changeStageFn = createServerFn({ method: "POST" })
  .validator(validate(changeStageSchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:update"));
      return await runChangeStage(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const reopenFn = createServerFn({ method: "POST" })
  .validator(validate(reopenSchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:update"));
      return await runReopen(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const addActivityFn = createServerFn({ method: "POST" })
  .validator(validate(addActivitySchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:note"));
      return await runAddActivity(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const setFollowUpFn = createServerFn({ method: "POST" })
  .validator(validate(setFollowUpSchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:update"));
      return await runSetFollowUp(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const claimFn = createServerFn({ method: "POST" })
  .validator(validate(claimSchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:claim"));
      return await runClaim(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const assignFn = createServerFn({ method: "POST" })
  .validator(validate(assignSchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:assign"));
      return await runAssign(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(validate(updateContactSchema))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE("inquiry:update"));
      return await runUpdateContact(actor, depsFor(env), data);
    } catch (err) {
      return toResponseError(err);
    }
  });
