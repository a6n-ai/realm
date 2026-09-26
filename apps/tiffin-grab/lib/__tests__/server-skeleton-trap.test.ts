import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// DataTable is a client component, so `DataTable.Skeleton` is undefined in a Server
// Component and the page 500s with "Element type is invalid … got: undefined". tsc can't see
// it (AGENTS.md "Component.Skeleton trap"). Server files must use the named DataTableSkeleton.
const ROOT = join(__dirname, "../..");

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

describe("Component.Skeleton trap", () => {
  it("no server file renders DataTable.Skeleton", () => {
    const offenders = [...files(join(ROOT, "app")), ...files(join(ROOT, "components"))]
      .filter((p) => !p.includes("__tests__"))
      .filter((p) => {
        const src = readFileSync(p, "utf8");
        return /<DataTable\.Skeleton\b/.test(src) && !/^\s*["']use client["']/.test(src);
      })
      .map((p) => relative(ROOT, p));
    expect(offenders).toEqual([]);
  });
});
