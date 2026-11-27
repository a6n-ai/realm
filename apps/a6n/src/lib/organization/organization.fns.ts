import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { refusing } from "../auth/actor";
import { depsFor } from "../deps";
import { WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { renameOwnOrganization } from "./service";

export const renameOrgSchema = z.object({ name: z.string().max(200) });

export const renameOwnOrganizationFn = createServerFn({ method: "POST" })
  .validator(validate(renameOrgSchema))
  .handler(({ data }) =>
    refusing(env, getRequestHeaders(), WRITE("organization:update"), (actor) => renameOwnOrganization(depsFor(env).db, data.name, actor)),
  );
