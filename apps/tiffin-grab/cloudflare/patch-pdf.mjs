// Runs after `next build` (open-next.config.ts buildCommand), on the traced standalone copy only,
// to make @react-pdf/renderer work on workerd.
// @react-pdf's layout engine (yoga-layout) compiles its WebAssembly from base64 at runtime, which
// workerd forbids. Give it a precompiled module instead: write the .wasm to cloudflare/ and make
// load.js import it by absolute path (OpenNext's copy step drops .wasm files, but it leaves
// `.wasm` imports external and wrangler bundles them from wherever they are).
// fs.globSync needs Node >= 22 (CI uses 22).
import { existsSync, globSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const [yogaDir] = globSync(".next/standalone/node_modules/.pnpm/yoga-layout@*/node_modules/yoga-layout/dist");
if (!yogaDir) throw new Error("patch-pdf: yoga-layout not found in .next/standalone (receipt/menu/labels PDFs need it)");
const yogaVersion = JSON.parse(readFileSync(path.join(yogaDir, "../package.json"), "utf8")).version;
if (yogaVersion !== "3.2.1") throw new Error(`patch-pdf: traced yoga-layout is ${yogaVersion}, this shim was written for 3.2.1; re-check load.js`);

const base64 = readFileSync(path.join(yogaDir, "binaries/yoga-wasm-base64-esm.js"), "utf8").match(/base64,([A-Za-z0-9+/=]+)/)?.[1];
if (!base64) throw new Error("patch-pdf: no embedded wasm found; yoga-layout changed, re-check the shim");
const wasmPath = path.resolve("cloudflare/yoga.wasm");
writeFileSync(wasmPath, Buffer.from(base64, "base64"));

const load = path.join(yogaDir, "src/load.js");
if (!existsSync(load)) throw new Error("patch-pdf: load.js missing");
if (!readFileSync(load, "utf8").includes("loadYoga")) throw new Error("patch-pdf: yoga load.js has no loadYoga export; re-check the shim");
writeFileSync(
  load,
  `import wasm from ${JSON.stringify(wasmPath)};
import loadYogaImpl from "../binaries/yoga-wasm-base64-esm.js";
import wrapAssembly from "./wrapAssembly.js";
export async function loadYoga() {
  return wrapAssembly(await loadYogaImpl({
    instantiateWasm(imports, cb) {
      WebAssembly.instantiate(wasm, imports).then((inst) => cb(inst));
      return {};
    },
  }));
}
export * from "./generated/YGEnums.js";
`,
);

// pdfkit's Node build loads its standard fonts with createRequire(import.meta.url).require("#..."),
// which workerd cannot do (and its browser build needs fflate, which is not traced). Turn those
// requires into static imports of the font modules, which esbuild then bundles. The fonts are
// imported from the real package dir by absolute path: OpenNext's copy step omits files nft did
// not trace, such as these and their shared chunks.
const [pdfkitCopy] = globSync(".next/standalone/node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/pdfkit.node.mjs");
if (!pdfkitCopy) throw new Error("patch-pdf: pdfkit not found");
const pdfkitVersionDir = pdfkitCopy.match(/\.pnpm\/(pdfkit@[^/]+)\//)[1];
const fontsDir = path.resolve("../../node_modules/.pnpm", pdfkitVersionDir, "node_modules/pdfkit/js/standard-fonts");
if (!existsSync(fontsDir)) throw new Error(`patch-pdf: ${fontsDir} missing; pdfkit font dir must match the traced ${pdfkitVersionDir}`);
let src = readFileSync(pdfkitCopy, "utf8");
const names = new Set();
src = src.replace(/require\$1\('#standard-fonts\/(\w+)'\)/g, (_, n) => (names.add(n), `sf_${n}`));
if (names.size !== 14) throw new Error(`patch-pdf: expected 14 standard fonts, found ${names.size}; pdfkit changed`);
const imports = [...names].map((n) => `import sf_${n} from ${JSON.stringify(path.resolve(fontsDir, `${n}.mjs`))};`).join("\n");
writeFileSync(pdfkitCopy, `${imports}\n${src}`);

// @react-email/render dynamically imports prettier only for `render(el, { pretty: true })`, which
// nothing here passes, and the email code editor formats in the browser (prettier/standalone).
// Turbopack still emits `x.y("prettier-<hash>[/sub]")` external loads in the chunks, and OpenNext
// builds its runtime require table from the `.next/node_modules/prettier-<hash>` symlink, so
// wrangler inlines all of prettier (~5.6 MB). Replace the loads with an empty module and drop the
// symlink; formatting is never reached on the server.
for (const link of globSync(".next/standalone/apps/*/.next/node_modules/prettier-*")) rmSync(link);
let stubbed = 0;
for (const file of globSync(".next/standalone/apps/*/.next/server/**/*.js")) {
  const before = readFileSync(file, "utf8");
  if (!before.includes("prettier-")) continue;
  const after = before.replace(/\w+\.y\("prettier-[0-9a-f]+[^"]*"\)/g, () => (stubbed++, "({})"));
  if (after !== before) writeFileSync(file, after);
}
if (!stubbed) throw new Error("patch-pdf: no prettier loads found in the server chunks; the stub is stale, check whether it is still needed");
