// OpenNext inlines every Turbopack external into the middleware bundle, including prettier's
// CJS entry, whose lazy `import("./index.mjs")` has no file beside middleware/handler.mjs and
// fails wrangler's bundling. The server bundle has no prettier at all (patch-pdf.mjs strips it);
// this covers the middleware copy only. Nothing calls prettier on Workers: the email editor loads
// the standalone build in the browser, so an empty module satisfies the resolver.
// Run by wrangler's `build.command`, i.e. before every deploy, dev and dry-run bundle.
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".open-next/middleware", { recursive: true });
writeFileSync(".open-next/middleware/index.mjs", "export {};\n");
