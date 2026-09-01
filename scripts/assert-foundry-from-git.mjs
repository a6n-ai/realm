#!/usr/bin/env node
/**
 * Dual-path: listed @foundry/* packages must resolve from the a6n-ai/foundry
 * GitHub tarball, not a nested foundry/ tree.
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = [
  "ai",
  "auth",
  "auth-ui",
  "clover",
  "commons",
  "coupons",
  "crm",
  "database",
  "design-system",
  "email",
  "eslint-config",
  "google-reviews",
  "order-tracking",
  "payments",
  "places",
  "realtime",
  "routes",
  "storage",
  "themes",
  "ui",
  "wallet",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const name of PACKAGES) {
  const real = realpathSync(join(root, "node_modules/@foundry", name));
  if (
    real.includes(`/foundry/packages/${name}`) ||
    real.includes(`/foundry/tooling/${name}`)
  ) {
    console.error(`@foundry/${name} still workspace-linked:\n${real}`);
    process.exit(1);
  }
  if (!real.includes("a6n-ai+foundry") && !real.includes("a6n-ai/foundry")) {
    console.error(`@foundry/${name} did not resolve from a6n-ai/foundry:\n${real}`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(join(real, "package.json"), "utf8"));
  if (pkg.name !== `@foundry/${name}`) {
    console.error(`expected @foundry/${name}, got ${pkg.name}`);
    process.exit(1);
  }
  console.log(`@foundry/${name} from git: ${real}`);
}
