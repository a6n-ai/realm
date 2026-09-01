#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(here, "assert-foundry-from-git.mjs")], { stdio: "inherit" });
process.exit(r.status === null ? 1 : r.status);
