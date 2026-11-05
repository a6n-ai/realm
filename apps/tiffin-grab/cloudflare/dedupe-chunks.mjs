// Runs after `next build` (open-next.config.ts buildCommand), on the traced standalone copy only.
// Turbopack writes the same server chunk under several names, once per route group that uses it
// (better-auth + drizzle + zod 7 times, the email editor 3 times): about 12 MB of the 53 MB Worker
// on 2026-11-05. OpenNext turns the runtime's chunk loading into one static require per file, so
// every copy was bundled. A Turbopack server chunk is `(()=>{module.exports=[id, factory, ...]})()` and the
// runtime only reads that array, so a copy can re-export the first file with that content.
import { readFileSync, writeFileSync, globSync } from "node:fs";
import path from "node:path";

const dir = ".next/standalone/apps/tiffin-grab/.next/server/chunks";
const files = globSync(`${dir}/**/*.js`).sort();
if (files.length === 0) throw new Error(`dedupe-chunks: no chunks under ${dir}`);

const SOURCE_MAP = /\n?\/\/# sourceMappingURL=\S+\s*$/;
const first = new Map();
let saved = 0;
let count = 0;
for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // Only factory-array chunks; the runtime and anything else keep their own copy.
  if (!/^\(\(\)=>\{(?:"use strict";)?module\.exports=\[/.test(raw)) continue;
  const body = raw.replace(SOURCE_MAP, "");
  const original = first.get(body);
  if (!original) {
    first.set(body, file);
    continue;
  }
  let rel = path.relative(path.dirname(file), original);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  writeFileSync(file, `module.exports=require(${JSON.stringify(rel)});\n`);
  saved += body.length;
  count++;
}
console.log(`dedupe-chunks: ${count} duplicate chunks now re-export the first copy (${(saved / 1e6).toFixed(1)} MB)`);
