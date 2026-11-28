#!/usr/bin/env node
// @blocknote/xl-* packages are AGPL/GPL or paid; none may enter the lockfile.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const lockfile = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "pnpm-lock.yaml");
const found = [...new Set(readFileSync(lockfile, "utf8").match(/@blocknote\/xl-[a-z0-9-]+/g))];
if (found.length) {
  console.error(found.join("\n"));
  process.exit(1);
}
console.log("no @blocknote/xl-* packages");
