import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { refusing } from "../auth/actor";
import { depsFor } from "../deps";
import { read, WRITE } from "../guarded.fns";
import { validate } from "../schemas";
import {
  runAddSubsource,
  runCreateSource,
  runRenameSource,
  runSetSourceActive,
  runSetSubsourceActive,
} from "./sources-actions-core";
import { addSubsourceSchema, createSourceSchema, renameSourceSchema, setActiveSchema } from "./sources-schemas";
import { createSourcesService } from "./sources";

export const listSourcesFn = createServerFn({ method: "GET" }).handler(() =>
  read("source:manage", () => createSourcesService(depsFor(env).db).listAll()),
);

export const createSourceFn = createServerFn({ method: "POST" })
  .validator(validate(createSourceSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("source:manage"), (actor) => runCreateSource(actor, depsFor(env), data)));

export const renameSourceFn = createServerFn({ method: "POST" })
  .validator(validate(renameSourceSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("source:manage"), (actor) => runRenameSource(actor, depsFor(env), data)));

export const setSourceActiveFn = createServerFn({ method: "POST" })
  .validator(validate(setActiveSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("source:manage"), (actor) => runSetSourceActive(actor, depsFor(env), data)));

export const addSubsourceFn = createServerFn({ method: "POST" })
  .validator(validate(addSubsourceSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("source:manage"), (actor) => runAddSubsource(actor, depsFor(env), data)));

export const setSubsourceActiveFn = createServerFn({ method: "POST" })
  .validator(validate(setActiveSchema))
  .handler(({ data }) => refusing(env, getRequestHeaders(), WRITE("source:manage"), (actor) => runSetSubsourceActive(actor, depsFor(env), data)));
