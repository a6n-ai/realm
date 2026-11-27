// Builds, migrates D1, deploys the Worker, then verifies migrations. Dry-run unless --apply.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR, build, wrangler, WRANGLER_CONFIG } from "./lib/run.ts";
import { describeStep, deployPlan, parseAppliedNames, runPlan, unappliedOrDrift } from "./lib/deploy-plan.ts";
import { parseWranglerJsonc } from "./lib/wrangler-config.ts";

const apply = process.argv.includes("--apply");
const { d1 } = parseWranglerJsonc(readFileSync(WRANGLER_CONFIG, "utf8"));
const steps = deployPlan(d1.map((d) => d.name));

if (!apply) {
  for (const step of steps) console.log(`plan: ${describeStep(step)}`);
  console.log("dry-run: nothing executed. Re-run with --apply to deploy.");
  process.exit(0);
}

await runPlan(
  steps,
  async (step) => {
    if (step.kind === "build") return build();
    if (step.kind === "wrangler") {
      wrangler(step.args);
      return;
    }
    const binding = d1.find((d) => d.name === step.db)!;
    const files = readdirSync(join(APP_DIR, binding.migrationsDir)).filter((f) => f.endsWith(".sql"));
    const out = wrangler(["d1", "execute", step.db, "--remote", "--command", "select name from d1_migrations", "--json"], true);
    const bad = unappliedOrDrift(files, parseAppliedNames(out));
    if (bad.length) throw new Error(`migrations not applied on ${step.db}: ${bad.join(", ")}`);
  },
  console.log,
);
