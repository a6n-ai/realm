// Pure: no Node or Workers imports, so the vitest workers pool can load it.
export type DeployStep =
  | { name: string; kind: "build" }
  | { name: string; kind: "wrangler"; args: string[] }
  | { name: string; kind: "verify"; db: string };

// Order is the contract: a failed build stops before D1 is touched; every migration lands before the Worker that needs it.
export function deployPlan(d1Names: string[]): DeployStep[] {
  return [
    { name: "build", kind: "build" },
    ...d1Names.map((db): DeployStep => ({
      name: `migrate ${db}`,
      kind: "wrangler",
      args: ["d1", "migrations", "apply", db, "--remote"],
    })),
    { name: "deploy worker", kind: "wrangler", args: ["deploy"] },
    ...d1Names.map((db): DeployStep => ({ name: `verify ${db}`, kind: "verify", db })),
  ];
}

export function describeStep(step: DeployStep): string {
  if (step.kind === "build") return "vite build";
  if (step.kind === "wrangler") return `wrangler ${step.args.join(" ")}`;
  return `wrangler d1 execute ${step.db} --remote --command "select name from d1_migrations" --json (must match drizzle/*.sql)`;
}

// A throwing exec stops the run: later steps never start.
export async function runPlan(
  steps: DeployStep[],
  exec: (step: DeployStep) => Promise<void>,
  log: (line: string) => void,
): Promise<void> {
  for (const step of steps) {
    log(`start ${step.name}`);
    await exec(step);
    log(`done ${step.name}`);
  }
}

// Names unapplied (in files, not listed as applied) plus applied names with no file (drift).
export function unappliedOrDrift(files: string[], applied: string[]): string[] {
  return [...files.filter((f) => !applied.includes(f)), ...applied.filter((a) => !files.includes(a))];
}

// `d1 migrations list` prints only unapplied migrations, or "No migrations to apply".
export function parsePendingNames(out: string): string[] {
  const names = out.match(/\b\d{4}_[\w-]+\.sql\b/g) ?? [];
  if (!names.length && !/no migrations to apply/i.test(out)) throw new Error("unrecognised `d1 migrations list` output");
  return names;
}

// Output of `d1 execute --json`: [{ results: [{ name }] }].
export function parseAppliedNames(out: string): string[] {
  const rows = (JSON.parse(out) as { results?: { name?: unknown }[] }[])[0]?.results;
  if (!Array.isArray(rows) || rows.some((r) => typeof r.name !== "string")) throw new Error("unrecognised d1_migrations query output");
  return rows.map((r) => r.name as string);
}
