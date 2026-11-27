import type { Actor } from "../auth/actor";
import type { Deps } from "../deps";
import { gate, type ActionResult } from "./actions-core";
import { addSubsourceSchema, createSourceSchema, renameSourceSchema, setActiveSchema } from "./sources-schemas";
import { createSourcesService, type SourceResult } from "./sources";

const svc = (deps: Deps) => createSourcesService(deps.db);

async function run<S extends Parameters<typeof gate>[1]>(
  schema: S,
  actor: Actor,
  input: unknown,
  go: (data: import("zod").z.output<S>) => Promise<SourceResult>,
): Promise<ActionResult<{ id?: string }>> {
  const g = gate("source:manage", schema, actor, input);
  return "refusal" in g ? g.refusal : go(g.data);
}

export const runCreateSource = (actor: Actor, deps: Deps, input: unknown) =>
  run(createSourceSchema, actor, input, (d) => svc(deps).create(d, actor));

export const runRenameSource = (actor: Actor, deps: Deps, input: unknown) =>
  run(renameSourceSchema, actor, input, (d) => svc(deps).rename(d.id, d.label, actor));

export const runSetSourceActive = (actor: Actor, deps: Deps, input: unknown) =>
  run(setActiveSchema, actor, input, (d) => svc(deps).setActive(d.id, d.active, actor));

export const runAddSubsource = (actor: Actor, deps: Deps, input: unknown) =>
  run(addSubsourceSchema, actor, input, (d) => svc(deps).addSubsource(d.sourceId, { key: d.key, label: d.label }, actor));

export const runSetSubsourceActive = (actor: Actor, deps: Deps, input: unknown) =>
  run(setActiveSchema, actor, input, (d) => svc(deps).setSubsourceActive(d.id, d.active, actor));
