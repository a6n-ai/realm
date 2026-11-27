import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { refusing } from "../auth/actor";
import { depsFor } from "../deps";
import { read, WRITE } from "../guarded.fns";
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

export const createInquiryFn = createServerFn({ method: "POST" })
  .validator(validate(createInquirySchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:create"), (actor) => runCreateInquiry(actor, depsFor(env), data)));

export const changeStageFn = createServerFn({ method: "POST" })
  .validator(validate(changeStageSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:update"), (actor) => runChangeStage(actor, depsFor(env), data)));

export const reopenFn = createServerFn({ method: "POST" })
  .validator(validate(reopenSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:update"), (actor) => runReopen(actor, depsFor(env), data)));

export const addActivityFn = createServerFn({ method: "POST" })
  .validator(validate(addActivitySchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:note"), (actor) => runAddActivity(actor, depsFor(env), data)));

export const setFollowUpFn = createServerFn({ method: "POST" })
  .validator(validate(setFollowUpSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:update"), (actor) => runSetFollowUp(actor, depsFor(env), data)));

export const claimFn = createServerFn({ method: "POST" })
  .validator(validate(claimSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:claim"), (actor) => runClaim(actor, depsFor(env), data)));

export const assignFn = createServerFn({ method: "POST" })
  .validator(validate(assignSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:assign"), (actor) => runAssign(actor, depsFor(env), data)));

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(validate(updateContactSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("inquiry:update"), (actor) => runUpdateContact(actor, depsFor(env), data)));
