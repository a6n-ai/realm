# Image File Upload (FileDetail + diceui) — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan

## Purpose

Replace free-text image-URL entry with real file upload wherever the app takes an
image URL. Today that is exactly one field: `dishes.imageUrl`, edited through the
generic catalog `ResourceEditor`. Uploads go through the `@tiffin/commons-files`
`FileSystemService` (local-disk backend now, S3 when configured), and the entity
stores the full `FileDetail` JSON — mirroring nocode-saas, where entities embed a
`FileDetail` field (e.g. `Product.logoFileDetail`, `bannerFileDetail`).

Adding an `"image"` field type to the generic editor means any future image field
gets upload for free.

## Reference: nocode-saas pattern

Entities store the whole file object as a JSON field, not just a URL:
`entity-processor/.../oserver/files/model/FileDetail.java` with fields
`id, name, isDirectory, size, filePath, url, createdDate, lastModifiedTime, type,
fileName` — the same shape as our `FileDetail` in `@tiffin/commons-files`.

## Scope (verified)

`imageUrl` appears in exactly two places:
- `apps/web/db/schema/catalog.ts:15` — `imageUrl: text("image_url")`.
- `apps/web/app/(dashboard)/dashboard/menus/actions.ts:45` — `dishesService.create({ …, imageUrl: null })`.

No display site reads `dishes.imageUrl` yet. Reader impact is therefore minimal.

## §1 — Stored value: `FileDetail` JSON

- `dishes.imageUrl text` → `dishes.image jsonb` typed `.$type<FileDetail>()`.
- `FileDetail` is exported from `@tiffin/commons-files` via a **new lightweight
  subpath** `./model` (maps to `src/model/file-detail.ts`) so `@/db/schema` and
  form code importing the type never pull the aws-sdk-carrying root barrel — same
  boundary discipline as the existing `./schema` subpath. Add to
  `packages/commons-files/package.json` exports:
  `"./model": "./src/model/file-detail.ts"`.
- Migration (hand-edited after `db:generate`, data-preserving):
  1. `ALTER TABLE dishes ADD COLUMN image jsonb;`
  2. `UPDATE dishes SET image = jsonb_build_object('url', image_url) WHERE image_url IS NOT NULL;`
  3. `ALTER TABLE dishes DROP COLUMN image_url;`
  (drizzle's generated diff would drop+add and lose data — the plan replaces its
  body with the three statements above.)

## §2 — Upload endpoint

`apps/web/app/api/files/upload/route.ts` — `POST`, multipart `FormData` (`file`):
- `requireStaff()` (admin + member) — catalog editing is staff-only.
- Validate: MIME in `{image/png, image/jpeg, image/webp, image/gif}` and size ≤ 5 MB.
  Reject with `400` + message otherwise (mapped via existing error handling).
- Key: `catalog/dishes/<nanoid()>/<sanitized-filename>` (sanitize: lowercase,
  strip to `[a-z0-9._-]`, collapse repeats). Optional `prefix` form field lets other
  callers scope their own path; default `uploads`.
- `await filesService().create(key, bytes, { contentType })` → registers the
  `files_file_system` row and writes to the storage backend.
- Respond `200` with the returned `FileDetail` JSON.

## §3 — Serving files in local-disk mode

Local `presignGet` returns a non-servable `file://` path, and static `url` is
`${FILES_PUBLIC_BASE_URL}/<key>`. To make uploaded images render with no S3:
- Default `FILES_PUBLIC_BASE_URL` to `/api/files` when unset (in the factory), so a
  stored `FileDetail.url` is `/api/files/<key>`.
- Add `apps/web/app/api/files/[...key]/route.ts` — `GET`, streams
  `filesService().get(key)` with the right `Content-Type` for **static** resources.
  (Secured resources are out of scope here; see ponytail note.)

## §4 — diceui file-upload component

- Add the diceui registry to `apps/web/components.json` `registries`
  (`"@diceui": "https://diceui.com/r/{name}.json"` — exact URL confirmed at
  implementation time) and add the `file-upload` component into `components/ui`.
- `apps/web/components/ds/image-upload-field.tsx` — `ImageUploadField` wrapping the
  diceui component for RHF:
  - Props: `value: FileDetail | null`, `onChange(v: FileDetail | null)`, `disabled?`.
  - Shows a preview `<img src={value.url}>` when set; drop/select uploads one image
    to `/api/files/upload`; on success sets `value` to the returned `FileDetail`;
    shows progress and inline error; a clear button sets `null`.
  - Single file, image-only, 5 MB — mirrors server limits client-side for UX.

## §5 — Generic editor `"image"` field type

- `resource-config.ts`: add `"image"` to `FieldType`. Change the dishes field to
  `{ key: "image", label: "Image", type: "image", optional: true, tableHidden: true }`.
  Replace the zod `imageUrl` rule with `image`: a nullable/optional object schema
  matching `FileDetail` (`url` required within it; other fields passthrough).
- `[resource]/resource-editor.tsx`: add a branch `f.type === "image"` rendering
  `ImageUploadField` bound to the RHF field. List table: show a small thumbnail from
  `value?.url` (or nothing) — but the field is `tableHidden`, so no table change
  needed beyond leaving it hidden.
- `[resource]/page.tsx`: `dto[f.key] = r[f.key]` already carries `image` (jsonb) — no
  change beyond the field key rename.

## §6 — Reader updates

- `menus/actions.ts:45`: `imageUrl: null` → `image: null`.

## Out of scope / ponytail

- **Secured images:** static images store a stable `url`. Secured resources need
  read-time presigning (a stored `url` would expire), so they'd store
  `filePath`+`resourceType` and presign on read. Dishes are static; build static
  now, leave `FileDetail` JSON ready for secured later. Not built here.
- **Local read/write-through cache in front of S3** (mentioned earlier) — deferred.
- **Multi-file / gallery** — single image per field only.

## Testing

- Upload route: rejects non-image and >5 MB (`400`); happy path returns a
  `FileDetail` with a resolvable `url`; requires staff.
- `[...key]` GET: returns bytes + correct `Content-Type` for an uploaded key; 404 on
  missing.
- `ImageUploadField`: renders preview from `value.url`; clear sets null. (Component
  test light — the upload wiring is covered by the route test.)
- Migration: a dish row with an `image_url` becomes `image = {"url": …}`; null stays
  null; `image_url` column gone.

## Success criteria

- Uploading an image in the dishes editor stores a `FileDetail` JSON and the image
  renders (via `/api/files/...`) with no S3 configured.
- `@/db/schema` and form code do not import the aws-sdk barrel (only `./model`).
- `pnpm --filter web typecheck` + `@tiffin/commons-files` tests pass; no unrelated
  entity/route changed.
