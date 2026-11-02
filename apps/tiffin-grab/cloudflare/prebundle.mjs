// Run by wrangler's `build.command` (deploy, dev, dry-run). wrangler.jsonc ships the result with
// `no_bundle`, instead of letting wrangler minify. Reason: wrangler's minify rewrites esbuild's lazy
// module wrapper into an arrow function holding the whole 53 MB server handler, and V8 pays about
// 1 s of CPU to compile that on the first request of every cold isolate (even /robots.txt). The
// same bundle built unminified, then minified here as plain text, keeps the object-method wrapper
// and cold-starts in about half the time with identical size. Measured 2026-11-03, see
// deployment/cloudflare/README.md.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const raw = "cloudflare/dist-raw";
const out = "cloudflare/dist";
rmSync(raw, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
const wranglerPkg = require.resolve("wrangler/package.json");
const wranglerBin = join(dirname(wranglerPkg), "bin/wrangler.js");
execFileSync(process.execPath, [wranglerBin, "deploy", "--dry-run", "-c", "wrangler.bundle.jsonc", "--outdir", raw], {
  stdio: "inherit",
});

// wrangler's own esbuild; no extra dependency.
const esbuild = createRequire(wranglerPkg)("esbuild");
const { code } = esbuild.transformSync(readFileSync(`${raw}/worker.js`, "utf8"), {
  minify: true,
  format: "esm",
  target: "es2022",
  logLevel: "error",
});
// One non-Latin1 character (Cyrillic and dashes inside regexes, which esbuild's `charset` leaves alone) makes V8
// hold the whole script source as a two-byte string: 53M chars = 106 MB of the 128 MB isolate budget before any
// request, so heavy pages push the isolate over and it is recycled. \uXXXX is valid in strings, regexes,
// templates (cooked) and identifiers, and keeps the source one-byte.
const ascii = code.replace(/[\u0100-\uffff]/g, (c, at) => {
  let slashes = 0;
  while (code[at - 1 - slashes] === "\\") slashes++;
  // `\X` (identity escape) already has its backslash; adding a second would turn it into a literal one.
  return (slashes % 2 ? "u" : "\\u") + c.charCodeAt(0).toString(16).padStart(4, "0");
});
writeFileSync(`${out}/worker.js`, ascii);

// wasm / font blobs the bundle imports by relative path.
for (const f of readdirSync(raw)) if (f !== "worker.js" && f !== "README.md") copyFileSync(`${raw}/${f}`, `${out}/${f}`);
rmSync(raw, { recursive: true, force: true });
