// Runs after `next build` (open-next.config.ts buildCommand), on the traced standalone copy only,
// to make @react-pdf/renderer work on workerd.
// @react-pdf's layout engine (yoga-layout) compiles its WebAssembly from base64 at runtime, which
// workerd forbids. Give it a precompiled module instead: write the .wasm to cloudflare/ and make
// load.js import it by absolute path (OpenNext's copy step drops .wasm files, but it leaves
// `.wasm` imports external and wrangler bundles them from wherever they are).
import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [yogaDir] = globSync(".next/standalone/node_modules/.pnpm/yoga-layout@*/node_modules/yoga-layout/dist");
if (!yogaDir) throw new Error("patch-pdf: yoga-layout not found in .next/standalone (receipt/menu/labels PDFs need it)");

const base64 = readFileSync(path.join(yogaDir, "binaries/yoga-wasm-base64-esm.js"), "utf8").match(/base64,([A-Za-z0-9+/=]+)/)?.[1];
if (!base64) throw new Error("patch-pdf: no embedded wasm found; yoga-layout changed, re-check the shim");
const wasmPath = path.resolve("cloudflare/yoga.wasm");
writeFileSync(wasmPath, Buffer.from(base64, "base64"));

const load = path.join(yogaDir, "src/load.js");
if (!existsSync(load)) throw new Error("patch-pdf: load.js missing");
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
const [fontsDir] = globSync("../../node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts");
if (!pdfkitCopy || !fontsDir) throw new Error("patch-pdf: pdfkit not found");
let src = readFileSync(pdfkitCopy, "utf8");
const names = new Set();
src = src.replace(/require\$1\('#standard-fonts\/(\w+)'\)/g, (_, n) => (names.add(n), `sf_${n}`));
if (names.size !== 14) throw new Error(`patch-pdf: expected 14 standard fonts, found ${names.size}; pdfkit changed`);
const imports = [...names].map((n) => `import sf_${n} from ${JSON.stringify(path.resolve(fontsDir, `${n}.mjs`))};`).join("\n");
writeFileSync(pdfkitCopy, `${imports}\n${src}`);
