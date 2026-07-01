# `@tiffin/commons-files` — Storage & File Registry Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan

## Purpose

A standalone `@tiffin/commons-files` package that provides multi-cloud, S3-compatible
file storage plus a small file registry, structured so it can later be extracted into a
standalone file-server. Modeled on the `files` service in `ikara/nocode-saas`, adapted to
tiffin-grab conventions.

Two ideas carried over from nocode-saas:

1. **The `files` table holds only file rows.** Other entities do not get their own file
   columns wired to storage; they embed a `FileDetail` JSON snapshot describing the file.
2. **Storage is S3-API based**, so the same code runs on AWS S3, Cloudflare R2, MinIO, or
   Backblaze by pointing one S3 client at a configurable endpoint.

## Adaptations from nocode-saas

nocode-saas is a Java/Spring WebFlux, multi-tenant microservice. tiffin-grab is
single-tenant TypeScript. Deltas:

- **Single-tenant** — the `client_code CHAR(8)` scoping on every table is dropped.
- **Async/await** — no reactive/WebFlux; plain `async` services.
- **3-role RBAC** — nocode-saas granular `access_name` (role/permission strings) maps to
  tiffin's `RoleValue` (`admin | member | user`), integrating with existing `requireRole`.
- **One `resourceType` flag**, not the two-service (`Static` vs `Secured`) split with two
  buckets + CDN rewriting.

## Explicitly out of scope (cut during brainstorming)

- Zip upload/download async jobs (`files_upload_download` table + `UploadDownloadService`).
- Image transformation (`sharp`, resize/crop/rotate/flip, `ImageDetails` model,
  `TransformStaticImageController`).
- EventBridge / worker wiring — lives in the app, not this package.
- Migrating existing entities (e.g. `dishes.imageUrl`) to the registry — future work.

## Package shape

`packages/commons-files/`, mirroring the other commons packages:

- `type: module`, private, `exports: { ".": "./src/index.ts" }`.
- Dependencies: `@tiffin/commons` (workspace), `@tiffin/commons-drizzle` (workspace),
  `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- Peer: `drizzle-orm ^0.45.2` (matches commons-drizzle).
- Dev: `drizzle-orm`, `postgres`, `typescript`, `vitest`.
- No Next, no React.

The package **owns its own drizzle schema** so it can later split into a standalone
file-server. `apps/web/db/schema/files.ts` re-exports the tables into the app schema index.
This intentionally deviates from the "tables live in apps/web" convention, for portability.

## §1 — Storage layer (multi-cloud)

`StorageProvider` interface — the contract any backend fulfills:

```
put(key, body, opts?) -> { key, etag?, size }
get(key) -> ReadableStream / body + contentType + size
head(key) -> { size, contentType, lastModified } | null   // null if absent
list(prefix, opts?) -> { keys, commonPrefixes, isTruncated, nextToken? }
delete(key) -> void
copy(fromKey, toKey) -> void
presignGet(key, ttlSeconds) -> url
presignPut(key, ttlSeconds, opts?) -> url
```

`S3StorageProvider implements StorageProvider` — one `@aws-sdk/client-s3` `S3Client`,
config `{ endpoint?, region, bucket, credentials?, forcePathStyle? }`. `endpoint` +
`forcePathStyle` are what make it work against R2/MinIO/Backblaze; omit `endpoint` for AWS.
Presigning via `@aws-sdk/s3-request-presigner`. Follows the `AbstractEmailProvider` pattern
in `commons-notify` (abstract concern split from concrete transport) where it earns its
keep; a single concrete provider does not need a heavy abstract base — the interface is
enough.

One runnable check: an in-memory `StorageProvider` fake exercised through
put→head→get→list→copy→delete round-trips (no live S3 in unit tests).

## §2 — Model

`FileDetail` — ported verbatim from nocode-saas, the JSON shape entities embed:

```
{ id, name, fileName, type, isDirectory, size, filePath, url, createdDate, lastModifiedTime }
```

Plus `parseName(name)`: splits `name` on the last `.` into `fileName` + lowercased `type`
(no dot → whole name is `fileName`, no `type`). Mirrors the Java `setName` logic. Path/url
normalization (`//` → `/`) preserved.

One runnable check: `parseName` over `"a.PNG"`, `"noext"`, `".hidden"`, `"a.b.c"`.

## §3 — Schema (drizzle, in commons-files)

All tables use `updatableColumns(prefix)` from commons-drizzle (bigint id + public id +
created/updated audit columns). No `client_code`.

- **`fileSystem`** (`files_file_system`) — the only table holding file rows:
  `resourceType` enum(`static`,`secured`), `name`, `fileType` enum(`file`,`directory`),
  `size` (nullable), `parentId` (self-FK, `on delete cascade`), `path` (materialized full
  path). Indexes mirroring nocode-saas: `(resourceType, fileType, parentId)`,
  `(resourceType, fileType)`, `(name)`.
- **`filesAccessPath`** (`files_access_path`): `resourceType`, `accessName` (RoleValue,
  nullable), `writeAccess` (bool), `path`, `allowSubPathAccess` (bool, default true).
- **`filesSecuredAccessKey`** (`files_secured_access_key`): `path`, `accessKey` (unique),
  `accessTill` (epoch ms), `accessLimit` (nullable), `accessedCount` (default 0).

Epoch-ms for time columns, matching tiffin convention (`bigint` mode number), not SQL
`timestamp`.

## §4 — Services (subclass commons-drizzle)

Each service wraps a `Repository` over its table and reuses `BaseService`/`UpdatableService`.

- **`FileSystemService`** — the core. Combines the S3 `StorageProvider` with the
  `fileSystem` tree table:
  - `create(path, body, resourceType)` — put to storage + upsert tree rows (parents as
    directories), returns `FileDetail`.
  - `list(path)` — list children (tree table, falling back to storage `list` for the
    materialized view).
  - `get(path)` / `head(path)` / `delete(path)` (cascade tree + storage) / `move` / `copy`.
  - `toFileDetail(row, url?)` — row → `FileDetail`; `url` via `presignGet` for secured or
    public base URL for static.
- **`AccessPathService`** — `canRead(role, path)` / `canWrite(role, path)`: longest-prefix
  match over `filesAccessPath`, honoring `allowSubPathAccess`. Composes with `requireRole`
  in the app.
- **`SecuredAccessService`** — `mint(path, { ttl, limit })` → row with random `accessKey`;
  `validate(accessKey, path)` → checks `accessTill` and `accessLimit`, atomically bumps
  `accessedCount`, returns ok/expired/exhausted.

One runnable check per service: `AccessPathService` prefix/sub-path resolution, and
`SecuredAccessService` expiry + limit exhaustion, against the live test DB harness (the
existing pattern — real seeded Postgres).

## §5 — App wiring (standalone)

- `apps/web/db/schema/files.ts` re-exports the three tables; add to schema `index.ts`.
- One drizzle migration (`db:generate`) creates the tables.
- A small `apps/web/lib/files/` factory instantiates `S3StorageProvider` +
  `FileSystemService`/`AccessPathService`/`SecuredAccessService` with the app `db` and
  storage config read from env (`FILES_S3_ENDPOINT`, `FILES_S3_REGION`, `FILES_S3_BUCKET`,
  `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY`, `FILES_S3_FORCE_PATH_STYLE`,
  `FILES_PUBLIC_BASE_URL`).
- **No** existing entity migrated; **no** routes/controllers built in this project (the
  package is consumable; HTTP endpoints are future work when the file-server is needed).

## Build order (for the plan)

1. Package scaffold + `FileDetail` model.
2. Storage layer (`StorageProvider` + `S3StorageProvider` + in-memory fake + tests).
3. Schema (three tables) + migration.
4. `FileSystemService` over storage + tree.
5. `AccessPathService` + `SecuredAccessService`.
6. App wiring (re-export + env factory).

## Success criteria

- `@tiffin/commons-files` typechecks and tests pass in isolation.
- Storage provider round-trips against the in-memory fake and (manually) against one real
  S3-compatible endpoint.
- `files` tables created via migration; services instantiable from the app with env config.
- No existing entity or route changed.
