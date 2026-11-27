import { describe, expect, it } from "vitest";
import { deployPlan, describeStep, runPlan, unappliedOrDrift } from "./deploy-plan";

describe("deploy plan", () => {
  it("orders build, migrate, deploy, verify", () => {
    expect(deployPlan(["a6n"]).map((s) => s.name)).toEqual(["build", "migrate a6n", "deploy worker", "verify a6n"]);
  });

  it("describes the build step", () => {
    expect(describeStep(deployPlan(["a6n"])[0])).toBe("vite build");
  });

  it("stops at the first throwing step", async () => {
    const log: string[] = [];
    await expect(
      runPlan(
        deployPlan(["a6n"]),
        async (s) => {
          if (s.name === "migrate a6n") throw new Error("boom");
        },
        (l) => log.push(l),
      ),
    ).rejects.toThrow("boom");
    expect(log).toEqual(["start build", "done build", "start migrate a6n"]);
  });

  it("reports unapplied and drifted migrations", () => {
    expect(unappliedOrDrift(["0000_a.sql"], ["0000_a.sql", "0001_b.sql"])).toEqual(["0001_b.sql"]);
    expect(unappliedOrDrift(["0000_a.sql", "0009_x.sql"], ["0000_a.sql"])).toEqual(["0009_x.sql"]);
  });
});
