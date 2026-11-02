# Task 9c report

Status: DONE.

## 1. Prettier
- Importer chain: nothing in apps/tiffin-grab, @relay/*/src or @foundry/*/src imports prettier on the server. `@react-email/render` (via @relay/email, @relay/engine react-template, lib/notifications/menu-reminder) does `import("prettier/standalone")` / `plugins/html` lazily, only inside `pretty()`, reached only by `render(el, { pretty: true })`. No caller passes `pretty`. The email editor's `formatCode` (@relay/engine/src/ui/format.ts) uses prettier/standalone + babel/estree in a "use client" component: browser only, but Turbopack still emits SSR external loads for it (`[externals]_prettier_*` chunks).
- Why 5 MB reached the bundle: those loads are `x.y("prettier-<hash>[/sub]")`, and OpenNext builds the `[turbopack]_runtime.js` require table from the `.next/node_modules/prettier-<hash>` symlink, including a bare case that imports the full prettier index from the monorepo root (.pnpm/prettier@3.9.6).
- Change (cloudflare/patch-pdf.mjs, Workers buildCommand only, so EC2/Node builds are untouched): in the traced standalone copy, rewrite `x.y("prettier-<hash>...")` to `({})` in server chunks and delete the `prettier-*` symlink in `.next/node_modules`. Throws if no loads are found (stale). Email HTML is unchanged because `pretty` is never used; no email rendering code changed, so no new unit test.
- cloudflare/stub-prettier.mjs comment corrected: it covers the middleware copy only; the server bundle has no prettier.
- Size (wrangler deploy --dry-run Total Upload): 57,696 KiB (56.3 MiB) -> 52,541 KiB (51.3 MiB), -5.0 MiB; gzip 15,057 -> 13,507 KiB.

## 2. patch-pdf hardening
- Asserts traced yoga-layout is 3.2.1 (package.json) and load.js contains `loadYoga` before replacing it.
- pdfkit font dir derived from the traced copy's `pdfkit@<version>` path; errors if missing.
- Comment: fs.globSync needs Node >= 22 (CI uses 22).
- `pnpm cf:build` passes. PDF check: `wrangler dev` (local DB, read-only) with a signed URL for the latest local order: GET /api/receipts/<id> returned 200 application/pdf, body starts `%PDF-1.3`, 3.1 KB.

## Concerns
- Typecheck not run: no TS changed (only .mjs scripts).
- wrangler dev needed CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: the wrangler.jsonc localConnectionString role `tiffin` does not exist on this machine's Postgres.
- If Next/OpenNext changes how externals are emitted, the script throws loudly instead of silently regrowing.
