import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { depsFor } from "../deps";
import { read, refusing, WRITE } from "../guarded.fns";
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
import { getInquiryDetail, listBoardColumns, listInquiriesPage, listOwners } from "./queries";
import {
  addActivitySchema,
  assignSchema,
  changeStageSchema,
  claimSchema,
  createInquirySchema,
  getInquirySchema,
  listBoardSchema,
  listInquiriesSchema,
  reopenSchema,
  searchCompaniesSchema,
  setFollowUpSchema,
  updateContactSchema,
} from "./schemas";
import { createSourcesService } from "./sources";

export const listInquiriesFn = createServerFn({ method: "GET" })
  .validator(validate(listInquiriesSchema))
  .handler(({ data }) => read("inquiry:read", (actor) => listInquiriesPage(depsFor(env).db, actor, data)));

export const listBoardFn = createServerFn({ method: "GET" })
  .validator(validate(listBoardSchema))
  .handler(({ data }) => read("inquiry:read", (actor) => listBoardColumns(depsFor(env).db, actor, data)));

export const getInquiryFn = createServerFn({ method: "GET" })
  .validator(validate(getInquirySchema))
  .handler(({ data }) => read("inquiry:read", async (actor) => (await getInquiryDetail(depsFor(env).db, actor.organizationId, data.id)) ?? { missing: true as const }));

export const searchCompaniesFn = createServerFn({ method: "GET" })
  .validator(validate(searchCompaniesSchema))
  .handler(({ data }) => read("inquiry:create", (actor) => searchCompanies(depsFor(env).db, actor.organizationId, data.q)));

export const listActiveSourcesFn = createServerFn({ method: "GET" }).handler(() =>
  read("inquiry:read", (actor) => createSourcesService(depsFor(env).db, actor.organizationId).listActive()),
);

export const listOwnersFn = createServerFn({ method: "GET" }).handler(() => read("inquiry:read", (actor) => listOwners(depsFor(env).db, actor.organizationId)));

export const createInquiryFn = createServerFn({ method: "POST" })
  .validator(validate(createInquirySchema))
  .handler(({ data }) => refusing(WRITE("inquiry:create"), (actor) => runCreateInquiry(actor, depsFor(env), data)));

export const changeStageFn = createServerFn({ method: "POST" })
  .validator(validate(changeStageSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runChangeStage(actor, depsFor(env), data)));

export const reopenFn = createServerFn({ method: "POST" })
  .validator(validate(reopenSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runReopen(actor, depsFor(env), data)));

export const addActivityFn = createServerFn({ method: "POST" })
  .validator(validate(addActivitySchema))
  .handler(({ data }) => refusing(WRITE("inquiry:note"), (actor) => runAddActivity(actor, depsFor(env), data)));

export const setFollowUpFn = createServerFn({ method: "POST" })
  .validator(validate(setFollowUpSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runSetFollowUp(actor, depsFor(env), data)));

export const claimFn = createServerFn({ method: "POST" })
  .validator(validate(claimSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:claim"), (actor) => runClaim(actor, depsFor(env), data)));

export const assignFn = createServerFn({ method: "POST" })
  .validator(validate(assignSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:assign"), (actor) => runAssign(actor, depsFor(env), data)));

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(validate(updateContactSchema))
  .handler(({ data }) => refusing(WRITE("inquiry:update"), (actor) => runUpdateContact(actor, depsFor(env), data)));
