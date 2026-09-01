#!/usr/bin/env node
/**
 * Dual-path: listed @relay/* packages must resolve from the a6n-ai/relay
 * GitHub tarball, not a nested relay/packages/<name> tree.
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = ["email", "engine", "sdk", "sms", "ui", "whatsapp"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const name of PACKAGES) {
  const real = realpathSync(join(root, "node_modules/@relay", name));
  if (real.includes(`/relay/packages/${name}`)) {
    console.error(`@relay/${name} still workspace-linked:\n${real}`);
    process.exit(1);
  }
  if (!real.includes("a6n-ai+relay") && !real.includes("a6n-ai/relay")) {
    console.error(`@relay/${name} did not resolve from a6n-ai/relay:\n${real}`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(join(real, "package.json"), "utf8"));
  if (pkg.name !== `@relay/${name}`) {
    console.error(`expected @relay/${name}, got ${pkg.name}`);
    process.exit(1);
  }
  console.log(`@relay/${name} from git: ${real}`);
}
