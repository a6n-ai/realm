import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { depsFor } from "../deps";
import { refusing, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import { renameOwnOrganization } from "./service";

export const renameOrgSchema = z.object({ name: z.string().max(200) });

export const renameOwnOrganizationFn = createServerFn({ method: "POST" })
  .validator(validate(renameOrgSchema))
  .handler(({ data }) =>
    refusing(WRITE("organization:update"), (actor) => renameOwnOrganization(depsFor(env).db, data.name, actor)),
  );
