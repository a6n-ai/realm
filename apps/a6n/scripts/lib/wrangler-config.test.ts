import { expect, it } from "vitest";
import { parseWranglerJsonc } from "./wrangler-config";

it("parses jsonc with comments into the D1 entry", () => {
  const text = `// c
{ "name": "a6n", /* x */ "d1_databases": [ { "binding": "DB", "database_name": "a6n", // id later
  "migrations_dir": "drizzle", }, ], }`;
  expect(parseWranglerJsonc(text).d1).toEqual([{ binding: "DB", name: "a6n", migrationsDir: "drizzle" }]);
});
