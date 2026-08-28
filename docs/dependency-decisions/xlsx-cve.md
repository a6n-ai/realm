# xlsx CVE — accepted risk (npm has no patched version)

**Status:** Accepted risk as of 2026-08-28. Not fixed by a version bump.

## The problem

`xlsx@0.18.5` (used in `apps/tiffin-grab`) has open Dependabot alerts for a
ReDoS and a prototype-pollution CVE. `0.18.5` is the latest version SheetJS
has published to npm (`npm view xlsx versions --json` confirms `0.18.5` is
the newest, published from the same `registry.npmjs.org` tarball) — there is
no `npm install xlsx@x` that resolves this. SheetJS ships patched builds only
via their own CDN (cdn.sheetjs.com), not through the npm registry.

## Options considered

1. **Switch the install source to SheetJS's CDN tarball** — possible via a
   pnpm `overrides` pointing at a tarball URL, but introduces a non-npm-registry
   dependency source into the lockfile, which this repo has not done elsewhere.
2. **Replace `xlsx` with an alternative library** — a real fix, but requires
   auditing every call site that uses `xlsx` in tiffin-grab and is a
   meaningfully larger change than this plan's scope.
3. **Accept the risk** — chosen for now. Document why below.

## Why acceptance is reasonable here

Every real call site was audited (`rg -n "xlsx" apps/tiffin-grab --type ts`):

- `apps/tiffin-grab/app/api/inquiries/import/route.ts` — **parses an
  uploaded file** (`XLSX.read` on the raw upload bytes) to bulk-import
  inquiry leads. This is the one call site that actually feeds untrusted
  file bytes into the vulnerable parser. However, the route is gated by
  `await requireStaff()` (`apps/tiffin-grab/lib/auth/guards.ts`), which
  requires the `ADMIN` or `MEMBER` role — **it is not reachable by
  customers or anonymous users.** Only authenticated staff can reach it.
- `apps/tiffin-grab/app/(dashboard)/dashboard/inquiries/import/import-form.tsx`
  — client-side companion to the same import feature: parses the same
  uploaded file in-browser (`XLSX.read`) to populate the sheet/column
  picker before submit. Same trust boundary — this page lives under
  `/dashboard`, which self-guards on `requireStaff`/`requireAdmin` per the
  dashboard layout convention, so it is not customer-reachable either. A
  parser crash here is scoped to the staff member's own browser tab, not
  the server.
- `apps/tiffin-grab/app/api/inquiries/export/route.ts` and
  `apps/tiffin-grab/app/(dashboard)/dashboard/downloads/labels/labels-export-button.tsx`
  — only call `XLSX.write`/`XLSX.writeFile` to *generate* a workbook from
  data the app already holds. No parsing of external input at all.
- `apps/tiffin-grab/db/migrate-wordpress-customers.ts` — a one-off,
  developer-run CLI migration script (`tsx db/migrate-wordpress-customers.ts`)
  that parses a WordPress export file supplied via `EXPORT_PATH` by
  whoever runs it. Not a web-reachable code path at all.

**Conclusion:** the only path that parses untrusted bytes through the
vulnerable `xlsx` reader is the inquiry-import feature, and it is
staff-only (ADMIN/MEMBER role required both server- and client-side) —
never reachable by an unauthenticated user or a customer. This is not the
"any customer can upload a file" scenario that would make the CVEs a live,
high-severity concern; it narrows the exploit surface to a malicious or
compromised staff account, or a staff member unwittingly importing a
booby-trapped spreadsheet from an external partner. That is a real but
meaningfully smaller blast radius than a public upload endpoint, so
accepting the risk for now — rather than rushing Option 1 or 2 — is a
reasonable call. If a future feature ever lets customers or anonymous
users upload `.xlsx`/`.xls` files for server-side parsing, this decision
should be revisited immediately.

## Revisit when

- SheetJS publishes a patched version to npm, or
- A future plan takes on option 1 or 2 above, or
- Any new `xlsx`-parsing call site is added that is reachable by
  non-staff (customer or anonymous) input.
