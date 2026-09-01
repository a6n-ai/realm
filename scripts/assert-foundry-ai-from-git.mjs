#!/usr/bin/env node
/**
 * Phase 2 dual-path: @foundry/ai must resolve from the GitHub tarball, not the
 * nested foundry/packages/ai tree (that tree stays on disk but is not a workspace package).
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const real = realpathSync(join(root, "node_modules/@foundry/ai"));
if (real.includes("/foundry/packages/ai")) {
  console.error(`@foundry/ai still workspace-linked:\n${real}`);
  process.exit(1);
}
if (!real.includes("a6n-ai+foundry") && !real.includes("a6n-ai/foundry")) {
  console.error(`@foundry/ai did not resolve from a6n-ai/foundry:\n${real}`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(real, "package.json"), "utf8"));
if (pkg.name !== "@foundry/ai") {
  console.error(`expected @foundry/ai, got ${pkg.name}`);
  process.exit(1);
}
console.log(`@foundry/ai from git: ${real}`);
