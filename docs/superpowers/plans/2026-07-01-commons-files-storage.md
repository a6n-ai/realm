# `@tiffin/commons-files` Storage & File Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `@tiffin/commons-files` package: multi-cloud S3-compatible storage, a `files` registry table tree, and role-based + secured-key access, consumable from the app with no existing entity touched.

**Architecture:** A storage-agnostic `StorageProvider` interface with an `S3StorageProvider` (one AWS S3 client, configurable endpoint → S3/R2/MinIO). Three drizzle tables owned by the package (`files_file_system`, `files_access_path`, `files_secured_access_key`). Services subclass the `@tiffin/commons-drizzle` `Repository`/`Service` bases. The app re-exports the schema and instantiates services from env.

**Tech Stack:** TypeScript (ESM), drizzle-orm ^0.45.2, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, nanoid, vitest, postgres-js.

## Global Constraints

- Package name `@tiffin/commons-files`, `type: module`, `private: true`, `exports: { ".": "./src/index.ts" }`, `types: "./src/index.ts"`. Copy tsconfig/vitest from `packages/commons-drizzle` verbatim.
- Peer `drizzle-orm ^0.45.2` (never a direct dep — matches commons-drizzle).
- No Next, no React in the package.
- Time columns are epoch-ms `bigint({ mode: "number" })` (tiffin convention), never SQL `timestamp`.
- All tables use `updatableColumns(prefix)` from `@tiffin/commons-drizzle` (bigint id `default next_id()`, public id, created/updated audit cols). 3-letter id prefixes.
- Access roles are the app `RoleValue` union `"admin" | "member" | "user"` — stored as plain `text`.
- Live-DB tests: co-locate `*.test.ts`, gate with `describe.skipIf(!process.env.DATABASE_URL)`, create throwaway tables via raw SQL in `beforeAll` (the seeded harness DB has `next_id()`), drop nothing shared. Run with `pnpm --filter @tiffin/commons-files test`.
- Do NOT modify any existing entity, route, or the `imageUrl` columns.

## File Structure

**Create (package):**
- `packages/commons-files/package.json` — manifest.
- `packages/commons-files/tsconfig.json`, `vitest.config.ts` — copied from commons-drizzle.
- `packages/commons-files/src/index.ts` — barrel.
- `packages/commons-files/src/model/file-detail.ts` (+ `.test.ts`) — `FileDetail`, `parseName`, `normalizePath`.
- `packages/commons-files/src/storage/types.ts` — `StorageProvider` + IO types.
- `packages/commons-files/src/storage/memory-provider.ts` (+ `.test.ts`) — in-memory fake + the contract test.
- `packages/commons-files/src/storage/s3-provider.ts` (+ `.test.ts`) — `S3StorageProvider` + config.
- `packages/commons-files/src/schema/files.ts` — the three drizzle tables + enums.
- `packages/commons-files/src/services/file-system.service.ts` (+ `.test.ts`).
- `packages/commons-files/src/services/access-path.service.ts` (+ `.test.ts`).
- `packages/commons-files/src/services/secured-access.service.ts` (+ `.test.ts`).

**Create (app):**
- `apps/web/db/schema/files.ts` — re-export the three tables.
- `apps/web/lib/files/index.ts` — env-driven factory.

**Modify (app):**
- `apps/web/db/schema/index.ts` — add `export * from "./files";`.
- `apps/web/package.json` — add `"@tiffin/commons-files": "workspace:*"`.
- `apps/web/db/migrations/*` — generated.

---

### Task 1: Package scaffold + `FileDetail` model

**Files:**
- Create: `packages/commons-files/package.json`, `packages/commons-files/tsconfig.json`, `packages/commons-files/vitest.config.ts`, `packages/commons-files/src/index.ts`
- Create: `packages/commons-files/src/model/file-detail.ts`
- Test: `packages/commons-files/src/model/file-detail.test.ts`

**Interfaces:**
- Produces:
  - `interface FileDetail { id?: string; name: string; fileName: string; type?: string; isDirectory: boolean; size: number; filePath: string; url?: string; createdDate?: number; lastModifiedTime?: number }`
  - `parseName(name: string): { fileName: string; type?: string }`
  - `normalizePath(p: string | undefined): string | undefined`

- [ ] **Step 1: Scaffold the package manifest and config**

`packages/commons-files/package.json`:
```json
{
  "name": "@tiffin/commons-files",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "@tiffin/commons": "workspace:*",
    "@tiffin/commons-drizzle": "workspace:*",
    "nanoid": "^5.1.14"
  },
  "peerDependencies": {
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "drizzle-orm": "^0.45.2",
    "postgres": "^3.4.9",
    "typescript": "^5",
    "vitest": "^4.1.9"
  }
}
```

`packages/commons-files/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/commons-files/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write the failing test**

`packages/commons-files/src/model/file-detail.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { normalizePath, parseName } from "./file-detail";

describe("parseName", () => {
  it("splits name and lowercases extension", () => {
    expect(parseName("Photo.PNG")).toEqual({ fileName: "Photo", type: "png" });
  });
  it("treats a dotless name as fileName only", () => {
    expect(parseName("noext")).toEqual({ fileName: "noext" });
  });
  it("treats a leading-dot name as fileName only (no type)", () => {
    expect(parseName(".hidden")).toEqual({ fileName: ".hidden" });
  });
  it("splits on the last dot", () => {
    expect(parseName("a.b.c")).toEqual({ fileName: "a.b", type: "c" });
  });
});

describe("normalizePath", () => {
  it("collapses double slashes", () => {
    expect(normalizePath("/a//b///c")).toBe("/a/b/c");
  });
  it("passes undefined through", () => {
    expect(normalizePath(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiffin/commons-files test`
Expected: FAIL — cannot resolve `./file-detail`.

- [ ] **Step 4: Write the model**

`packages/commons-files/src/model/file-detail.ts`:
```ts
export interface FileDetail {
  id?: string;
  name: string;
  fileName: string;
  type?: string;
  isDirectory: boolean;
  size: number;
  filePath: string;
  url?: string;
  createdDate?: number;
  lastModifiedTime?: number;
}

// Mirrors nocode-saas FileDetail.setName: split on the LAST dot. ind <= 0 means
// no dot (-1) or a leading dot (0) — either way the whole string is the fileName.
export function parseName(name: string): { fileName: string; type?: string } {
  const n = name ?? "";
  const ind = n.lastIndexOf(".");
  if (ind <= 0) return { fileName: n };
  return { fileName: n.slice(0, ind), type: n.slice(ind + 1).toLowerCase() };
}

export function normalizePath(p: string | undefined): string | undefined {
  return p == null ? p : p.replace(/\/{2,}/g, "/");
}
```

- [ ] **Step 5: Create the barrel**

`packages/commons-files/src/index.ts`:
```ts
export * from "./model/file-detail";
```

- [ ] **Step 6: Install workspace deps and run the test**

Run: `pnpm install`
Run: `pnpm --filter @tiffin/commons-files test`
Expected: PASS (6 assertions).

- [ ] **Step 7: Commit**

```bash
git add packages/commons-files pnpm-lock.yaml
git commit -m "feat(commons-files): scaffold package and FileDetail model"
```

---

### Task 2: Storage layer — interface, in-memory fake, S3 provider

**Files:**
- Create: `packages/commons-files/src/storage/types.ts`
- Create: `packages/commons-files/src/storage/memory-provider.ts`
- Create: `packages/commons-files/src/storage/s3-provider.ts`
- Test: `packages/commons-files/src/storage/memory-provider.test.ts`
- Test: `packages/commons-files/src/storage/s3-provider.test.ts`
- Modify: `packages/commons-files/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface StorageProvider { readonly name; put(key, body, opts?): Promise<PutResult>; get(key): Promise<GetResult>; head(key): Promise<HeadResult | null>; list(prefix, opts?): Promise<ListResult>; delete(key): Promise<void>; copy(fromKey, toKey): Promise<void>; presignGet(key, ttlSeconds): Promise<string>; presignPut(key, ttlSeconds, opts?): Promise<string> }`
  - `class MemoryStorageProvider implements StorageProvider` (test double).
  - `class S3StorageProvider implements StorageProvider`; `interface S3StorageConfig { bucket; region; endpoint?; credentials?; forcePathStyle? }`.

- [ ] **Step 1: Write the interface + IO types**

`packages/commons-files/src/storage/types.ts`:
```ts
export interface PutOptions {
  contentType?: string;
}
export interface PutResult {
  key: string;
  etag?: string;
  size: number;
}
export interface GetResult {
  body: Uint8Array;
  contentType?: string;
  size: number;
}
export interface HeadResult {
  size: number;
  contentType?: string;
  lastModified?: number;
}
export interface ListOptions {
  delimiter?: string;
  maxKeys?: number;
  token?: string;
}
export interface ListResult {
  keys: string[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextToken?: string;
}

/** Contract any storage backend (S3, R2, MinIO, an in-memory fake) fulfills. */
export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<PutResult>;
  get(key: string): Promise<GetResult>;
  head(key: string): Promise<HeadResult | null>;
  list(prefix: string, opts?: ListOptions): Promise<ListResult>;
  delete(key: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  presignPut(key: string, ttlSeconds: number, opts?: PutOptions): Promise<string>;
}
```

- [ ] **Step 2: Write the failing contract test against the fake**

`packages/commons-files/src/storage/memory-provider.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MemoryStorageProvider } from "./memory-provider";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("MemoryStorageProvider (StorageProvider contract)", () => {
  it("round-trips put -> head -> get", async () => {
    const s = new MemoryStorageProvider();
    const put = await s.put("a/b.txt", enc("hello"), { contentType: "text/plain" });
    expect(put).toMatchObject({ key: "a/b.txt", size: 5 });
    const head = await s.head("a/b.txt");
    expect(head).toMatchObject({ size: 5, contentType: "text/plain" });
    const got = await s.get("a/b.txt");
    expect(dec(got.body)).toBe("hello");
  });

  it("head returns null for a missing key", async () => {
    const s = new MemoryStorageProvider();
    expect(await s.head("nope")).toBeNull();
  });

  it("lists by prefix with a delimiter into keys + commonPrefixes", async () => {
    const s = new MemoryStorageProvider();
    await s.put("d/1.txt", enc("1"));
    await s.put("d/sub/2.txt", enc("2"));
    const res = await s.list("d/", { delimiter: "/" });
    expect(res.keys).toEqual(["d/1.txt"]);
    expect(res.commonPrefixes).toEqual(["d/sub/"]);
  });

  it("copies then deletes", async () => {
    const s = new MemoryStorageProvider();
    await s.put("x", enc("v"));
    await s.copy("x", "y");
    expect(dec((await s.get("y")).body)).toBe("v");
    await s.delete("x");
    expect(await s.head("x")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiffin/commons-files test memory-provider`
Expected: FAIL — cannot resolve `./memory-provider`.

- [ ] **Step 4: Implement the in-memory fake**

`packages/commons-files/src/storage/memory-provider.ts`:
```ts
import type {
  GetResult,
  HeadResult,
  ListOptions,
  ListResult,
  PutOptions,
  PutResult,
  StorageProvider,
} from "./types";

interface Entry {
  body: Uint8Array;
  contentType?: string;
  lastModified: number;
}

const toBytes = (body: Uint8Array | string): Uint8Array =>
  typeof body === "string" ? new TextEncoder().encode(body) : body;

/** Test/double backend. Not for production use. */
export class MemoryStorageProvider implements StorageProvider {
  readonly name = "memory";
  private readonly store = new Map<string, Entry>();
  // lastModified is injectable so tests stay deterministic without Date.now().
  constructor(private readonly now: () => number = () => 0) {}

  async put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<PutResult> {
    const bytes = toBytes(body);
    this.store.set(key, { body: bytes, contentType: opts?.contentType, lastModified: this.now() });
    return { key, size: bytes.byteLength };
  }

  async get(key: string): Promise<GetResult> {
    const e = this.store.get(key);
    if (!e) throw new Error(`memory storage: not found: ${key}`);
    return { body: e.body, contentType: e.contentType, size: e.body.byteLength };
  }

  async head(key: string): Promise<HeadResult | null> {
    const e = this.store.get(key);
    return e ? { size: e.body.byteLength, contentType: e.contentType, lastModified: e.lastModified } : null;
  }

  async list(prefix: string, opts?: ListOptions): Promise<ListResult> {
    const keys: string[] = [];
    const prefixes = new Set<string>();
    for (const k of this.store.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const di = opts?.delimiter ? rest.indexOf(opts.delimiter) : -1;
      if (di === -1) keys.push(k);
      else prefixes.add(prefix + rest.slice(0, di + opts!.delimiter!.length));
    }
    return { keys, commonPrefixes: [...prefixes], isTruncated: false };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const e = this.store.get(fromKey);
    if (!e) throw new Error(`memory storage: not found: ${fromKey}`);
    this.store.set(toKey, { ...e });
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return `memory://get/${key}?ttl=${ttlSeconds}`;
  }

  async presignPut(key: string, ttlSeconds: number): Promise<string> {
    return `memory://put/${key}?ttl=${ttlSeconds}`;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiffin/commons-files test memory-provider`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the S3 provider instantiation test**

The S3 wire calls need a live endpoint (verified manually per the spec). The unit test covers construction + endpoint config only.

`packages/commons-files/src/storage/s3-provider.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { S3StorageProvider } from "./s3-provider";

describe("S3StorageProvider", () => {
  it("constructs for an S3-compatible endpoint (R2/MinIO) with path-style", () => {
    const s = new S3StorageProvider({
      bucket: "b",
      region: "auto",
      endpoint: "https://example.r2.cloudflarestorage.com",
      credentials: { accessKeyId: "k", secretAccessKey: "s" },
      forcePathStyle: true,
    });
    expect(s.name).toBe("s3");
  });

  it("constructs for AWS S3 (no endpoint)", () => {
    const s = new S3StorageProvider({ bucket: "b", region: "us-east-1" });
    expect(s.name).toBe("s3");
  });
});
```

- [ ] **Step 7: Run it (fails — no module)**

Run: `pnpm --filter @tiffin/commons-files test s3-provider`
Expected: FAIL — cannot resolve `./s3-provider`.

- [ ] **Step 8: Implement the S3 provider**

`packages/commons-files/src/storage/s3-provider.ts`:
```ts
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  GetResult,
  HeadResult,
  ListOptions,
  ListResult,
  PutOptions,
  PutResult,
  StorageProvider,
} from "./types";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  /** Set for R2/MinIO/Backblaze; omit for AWS S3. */
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /** Required true for MinIO and most non-AWS endpoints. */
  forcePathStyle?: boolean;
}

/** One S3 client pointed at any S3-compatible endpoint. */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: config.credentials,
    });
  }

  async put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<PutResult> {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const res = await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: opts?.contentType }),
    );
    return { key, etag: res.ETag, size: bytes.byteLength };
  }

  async get(key: string): Promise<GetResult> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = await res.Body!.transformToByteArray();
    return { body, contentType: res.ContentType, size: body.byteLength };
  }

  async head(key: string): Promise<HeadResult | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType,
        lastModified: res.LastModified?.getTime(),
      };
    } catch (err) {
      if ((err as { name?: string }).name === "NotFound") return null;
      throw err;
    }
  }

  async list(prefix: string, opts?: ListOptions): Promise<ListResult> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: opts?.delimiter,
        MaxKeys: opts?.maxKeys,
        ContinuationToken: opts?.token,
      }),
    );
    return {
      keys: (res.Contents ?? []).map((o) => o.Key!).filter(Boolean),
      commonPrefixes: (res.CommonPrefixes ?? []).map((p) => p.Prefix!).filter(Boolean),
      isTruncated: Boolean(res.IsTruncated),
      nextToken: res.NextContinuationToken,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({ Bucket: this.bucket, Key: toKey, CopySource: `${this.bucket}/${fromKey}` }),
    );
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  async presignPut(key: string, ttlSeconds: number, opts?: PutOptions): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts?.contentType }),
      { expiresIn: ttlSeconds },
    );
  }
}
```

- [ ] **Step 9: Export storage from the barrel and run all package tests**

Append to `packages/commons-files/src/index.ts`:
```ts
export * from "./storage/types";
export * from "./storage/s3-provider";
export * from "./storage/memory-provider";
```

Run: `pnpm --filter @tiffin/commons-files test`
Expected: PASS (all model + storage tests).

- [ ] **Step 10: Commit**

```bash
git add packages/commons-files pnpm-lock.yaml
git commit -m "feat(commons-files): S3-compatible storage provider + in-memory fake"
```

---

### Task 3: Schema — the three registry tables

**Files:**
- Create: `packages/commons-files/src/schema/files.ts`
- Modify: `packages/commons-files/src/index.ts`

**Interfaces:**
- Consumes: `updatableColumns` from `@tiffin/commons-drizzle`.
- Produces (drizzle tables + enums):
  - `fileResourceType` pgEnum `["static","secured"]`, `fileSystemNodeType` pgEnum `["file","directory"]`.
  - `fileSystem` table (`files_file_system`): `resourceType, name, fileType, size (number|null), parentId (bigint|null, self-FK cascade), path`.
  - `filesAccessPath` (`files_access_path`): `resourceType, accessName (text|null), writeAccess (bool), path, allowSubPathAccess (bool)`.
  - `filesSecuredAccessKey` (`files_secured_access_key`): `path, accessKey (unique), accessTill (number), accessLimit (number|null), accessedCount (number)`.

- [ ] **Step 1: Write the schema**

`packages/commons-files/src/schema/files.ts`:
```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { type AnyPgColumn, bigint, boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const fileResourceType = pgEnum("file_resource_type", ["static", "secured"]);
export const fileSystemNodeType = pgEnum("file_system_node_type", ["file", "directory"]);

// The ONLY table holding file rows. Directories are real rows (fileType=directory)
// so listing and cascade-delete work by parent_id, mirroring nocode-saas.
export const fileSystem = pgTable(
  "files_file_system",
  {
    ...updatableColumns("fsy"),
    resourceType: fileResourceType("resource_type").notNull().default("static"),
    name: text("name").notNull(),
    fileType: fileSystemNodeType("file_type").notNull().default("file"),
    size: bigint("size", { mode: "number" }),
    parentId: bigint("parent_id", { mode: "bigint" }).references((): AnyPgColumn => fileSystem.id, {
      onDelete: "cascade",
    }),
    path: text("path").notNull().default(""),
  },
  (t) => [
    index("idx_fs_rtype_ftype_parent").on(t.resourceType, t.fileType, t.parentId),
    index("idx_fs_rtype_ftype").on(t.resourceType, t.fileType),
    index("idx_fs_path").on(t.path),
  ],
);

export const filesAccessPath = pgTable("files_access_path", {
  ...updatableColumns("fap"),
  resourceType: fileResourceType("resource_type").notNull().default("static"),
  accessName: text("access_name"), // RoleValue: admin | member | user; null = any role
  writeAccess: boolean("write_access").notNull().default(false),
  path: text("path").notNull().default(""),
  allowSubPathAccess: boolean("allow_sub_path_access").notNull().default(true),
});

export const filesSecuredAccessKey = pgTable("files_secured_access_key", {
  ...updatableColumns("fsk"),
  path: text("path").notNull(),
  accessKey: text("access_key").notNull().unique(),
  accessTill: bigint("access_till", { mode: "number" }).notNull(), // epoch ms
  accessLimit: bigint("access_limit", { mode: "number" }),
  accessedCount: bigint("accessed_count", { mode: "number" }).notNull().default(0),
});
```

- [ ] **Step 2: Export schema from the barrel**

Append to `packages/commons-files/src/index.ts`:
```ts
export * from "./schema/files";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @tiffin/commons-files typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/commons-files
git commit -m "feat(commons-files): registry schema (file system, access path, secured key)"
```

---

### Task 4: `FileSystemService` — storage + tree

**Files:**
- Create: `packages/commons-files/src/services/file-system.service.ts`
- Test: `packages/commons-files/src/services/file-system.service.test.ts`
- Modify: `packages/commons-files/src/index.ts`

**Interfaces:**
- Consumes: `StorageProvider`, `fileSystem` table, `FileDetail`, `parseName`, `UpdatableRepository` from `@tiffin/commons-drizzle`, `Database` type.
- Produces:
  - `class FileSystemService` constructed as `new FileSystemService(storage, db, { publicBaseUrl?, resourceType? })`.
  - `create(path: string, body: Uint8Array | string, opts?: { contentType?: string }): Promise<FileDetail>`
  - `head(path: string): Promise<FileDetail | null>`
  - `get(path: string): Promise<GetResult>`
  - `list(dirPath: string): Promise<FileDetail[]>`
  - `delete(path: string): Promise<void>`

Design notes for the implementer: paths are normalized (`normalizePath`) and stored WITHOUT a leading slash as the storage key. `create` ensures a directory-row chain for every parent segment (`ensureDirectory`), inserts the file row with `parentId` + `size`, then `storage.put`. `delete` removes the row (FK cascade drops descendant rows) and the storage object. `url` on a returned `FileDetail` is `presignGet` for `secured`, else `${publicBaseUrl}/${path}` for `static` (undefined if no base url).

- [ ] **Step 1: Write the failing test (live DB)**

`packages/commons-files/src/services/file-system.service.test.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorageProvider } from "../storage/memory-provider";
import type { Database } from "@tiffin/commons-drizzle";
import { FileSystemService } from "./file-system.service";

const url = process.env.DATABASE_URL;
const client = postgres(url ?? "");
const db = drizzle(client) as unknown as Database;

describe.skipIf(!url)("FileSystemService (integration)", () => {
  let storage: MemoryStorageProvider;
  let svc: FileSystemService;

  beforeAll(async () => {
    await client`create table if not exists files_file_system (
      id bigint primary key default next_id(),
      public_id text not null unique,
      created_at bigint not null default 0,
      created_by bigint,
      updated_at bigint not null default 0,
      updated_by bigint,
      resource_type text not null default 'static',
      name text not null,
      file_type text not null default 'file',
      size bigint,
      parent_id bigint references files_file_system(id) on delete cascade,
      path text not null default ''
    )`;
  });

  beforeEach(async () => {
    await client`truncate table files_file_system restart identity cascade`;
    storage = new MemoryStorageProvider();
    svc = new FileSystemService(storage, db, { publicBaseUrl: "https://cdn.test" });
  });

  afterAll(async () => {
    await client`drop table if exists files_file_system`;
    await client.end();
  });

  it("create stores the object and returns a FileDetail with a static url", async () => {
    const fd = await svc.create("menu/dish/a.png", new TextEncoder().encode("img"), {
      contentType: "image/png",
    });
    expect(fd).toMatchObject({ name: "a.png", fileName: "a", type: "png", size: 3, isDirectory: false });
    expect(fd.url).toBe("https://cdn.test/menu/dish/a.png");
    expect((await storage.head("menu/dish/a.png"))?.size).toBe(3);
  });

  it("create builds a directory row chain, list returns children", async () => {
    await svc.create("menu/dish/a.png", "x");
    await svc.create("menu/dish/b.png", "y");
    const listed = await svc.list("menu/dish");
    expect(listed.map((f) => f.name).sort()).toEqual(["a.png", "b.png"]);
    const roots = await svc.list("");
    expect(roots.map((f) => f.name)).toEqual(["menu"]);
    expect(roots[0]?.isDirectory).toBe(true);
  });

  it("delete removes the object and the row", async () => {
    await svc.create("x/a.png", "v");
    await svc.delete("x/a.png");
    expect(await storage.head("x/a.png")).toBeNull();
    expect(await svc.head("x/a.png")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (fails — no module)**

Run: `pnpm --filter @tiffin/commons-files test file-system`
Expected: FAIL — cannot resolve `./file-system.service` (or the whole describe skips if `DATABASE_URL` is unset — set it first).

- [ ] **Step 3: Implement the service**

`packages/commons-files/src/services/file-system.service.ts`:
```ts
import { UpdatableRepository, type Database } from "@tiffin/commons-drizzle";
import { and, eq, isNull } from "drizzle-orm";
import { type FileDetail, normalizePath, parseName } from "../model/file-detail";
import { fileSystem } from "../schema/files";
import type { GetResult, StorageProvider } from "../storage/types";

type Row = typeof fileSystem.$inferSelect;
type ResourceType = "static" | "secured";

export interface FileSystemServiceOptions {
  resourceType?: ResourceType;
  publicBaseUrl?: string;
  signedUrlTtlSeconds?: number;
}

// Storage key = path without a leading slash.
const toKey = (path: string): string => (normalizePath(path) ?? "").replace(/^\/+/, "");

export class FileSystemService {
  private readonly repo: UpdatableRepository<typeof fileSystem>;
  private readonly resourceType: ResourceType;
  private readonly publicBaseUrl?: string;
  private readonly ttl: number;

  constructor(
    private readonly storage: StorageProvider,
    private readonly db: Database,
    opts: FileSystemServiceOptions = {},
  ) {
    this.repo = new UpdatableRepository(db, fileSystem, fileSystem.publicId, fileSystem.id);
    this.resourceType = opts.resourceType ?? "static";
    this.publicBaseUrl = opts.publicBaseUrl;
    this.ttl = opts.signedUrlTtlSeconds ?? 3600;
  }

  async create(path: string, body: Uint8Array | string, opts?: { contentType?: string }): Promise<FileDetail> {
    const key = toKey(path);
    const segments = key.split("/");
    const name = segments.pop()!;
    const parentId = await this.ensureDirectory(segments);

    const size = typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength;
    await this.storage.put(key, body, opts);
    const row = (await this.repo.create({
      resourceType: this.resourceType,
      name,
      fileType: "file",
      size,
      parentId,
      path: key,
    })) as Row;
    return this.toFileDetail(row, await this.urlFor(key));
  }

  async head(path: string): Promise<FileDetail | null> {
    const key = toKey(path);
    const row = await this.rowByPath(key);
    if (!row) return null;
    return this.toFileDetail(row, await this.urlFor(key));
  }

  async get(path: string): Promise<GetResult> {
    return this.storage.get(toKey(path));
  }

  async list(dirPath: string): Promise<FileDetail[]> {
    const key = toKey(dirPath);
    const parentId = key === "" ? null : (await this.rowByPath(key))?.id ?? null;
    const rows = await this.db
      .select()
      .from(fileSystem)
      .where(
        and(
          eq(fileSystem.resourceType, this.resourceType),
          parentId == null ? isNull(fileSystem.parentId) : eq(fileSystem.parentId, parentId),
        ),
      );
    return Promise.all(
      (rows as Row[]).map(async (r) => this.toFileDetail(r, r.fileType === "file" ? await this.urlFor(r.path) : undefined)),
    );
  }

  async delete(path: string): Promise<void> {
    const key = toKey(path);
    const row = await this.rowByPath(key);
    await this.storage.delete(key);
    if (row) await this.repo.deleteByPublicId(row.publicId);
  }

  // Ensure a directory row exists for each parent segment, returning the leaf
  // directory id (null for the root). Idempotent.
  private async ensureDirectory(segments: string[]): Promise<bigint | null> {
    let parentId: bigint | null = null;
    let acc = "";
    for (const seg of segments) {
      acc = acc === "" ? seg : `${acc}/${seg}`;
      const existing = await this.rowByPath(acc);
      if (existing) {
        parentId = existing.id;
        continue;
      }
      const dir = (await this.repo.create({
        resourceType: this.resourceType,
        name: seg,
        fileType: "directory",
        size: null,
        parentId,
        path: acc,
      })) as Row;
      parentId = dir.id;
    }
    return parentId;
  }

  private async rowByPath(key: string): Promise<Row | null> {
    const [row] = await this.db
      .select()
      .from(fileSystem)
      .where(and(eq(fileSystem.resourceType, this.resourceType), eq(fileSystem.path, key)))
      .limit(1);
    return (row as Row) ?? null;
  }

  private async urlFor(key: string): Promise<string | undefined> {
    if (this.resourceType === "secured") return this.storage.presignGet(key, this.ttl);
    return this.publicBaseUrl ? `${this.publicBaseUrl}/${key}` : undefined;
  }

  private toFileDetail(row: Row, url?: string): FileDetail {
    const { fileName, type } = parseName(row.name);
    return {
      id: row.publicId,
      name: row.name,
      fileName,
      type,
      isDirectory: row.fileType === "directory",
      size: row.size ?? 0,
      filePath: row.path,
      url,
      createdDate: row.createdAt,
      lastModifiedTime: row.updatedAt,
    };
  }
}
```

- [ ] **Step 4: Export from the barrel and run the test**

Append to `packages/commons-files/src/index.ts`:
```ts
export * from "./services/file-system.service";
```

Run: `DATABASE_URL=<seeded test db url> pnpm --filter @tiffin/commons-files test file-system`
Expected: PASS (3 tests). (Use the same `DATABASE_URL` the commons-drizzle integration tests use.)

- [ ] **Step 5: Commit**

```bash
git add packages/commons-files
git commit -m "feat(commons-files): FileSystemService over storage + tree"
```

---

### Task 5: `AccessPathService` + `SecuredAccessService`

**Files:**
- Create: `packages/commons-files/src/services/access-path.service.ts`
- Create: `packages/commons-files/src/services/secured-access.service.ts`
- Test: `packages/commons-files/src/services/access.service.test.ts`
- Modify: `packages/commons-files/src/index.ts`

**Interfaces:**
- Consumes: `filesAccessPath`, `filesSecuredAccessKey`, `Database`.
- Produces:
  - `type RoleValue = "admin" | "member" | "user"`
  - `class AccessPathService`: `new AccessPathService(db)`; `canRead(role, path, resourceType?): Promise<boolean>`; `canWrite(role, path, resourceType?): Promise<boolean>`.
  - `class SecuredAccessService`: `new SecuredAccessService(db, now?)`; `mint(path, { ttlSeconds, limit? }): Promise<{ accessKey: string }>`; `validate(accessKey, path): Promise<{ ok: true } | { ok: false; reason: "not_found" | "expired" | "exhausted" | "path_mismatch" }>`.

Design notes: `static` resources are public-read (`canRead` short-circuits `true`). `secured` read and all writes require a matching `filesAccessPath` row: `path === target`, or `allowSubPathAccess` and `target` starts with `path + "/"`, and `accessName` is null or equals the role. `validate` bumps `accessedCount` atomically with a conditional UPDATE so a concurrent caller can't exceed `accessLimit`.

- [ ] **Step 1: Write the failing tests (live DB)**

`packages/commons-files/src/services/access.service.test.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@tiffin/commons-drizzle";
import { AccessPathService } from "./access-path.service";
import { SecuredAccessService } from "./secured-access.service";

const url = process.env.DATABASE_URL;
const client = postgres(url ?? "");
const db = drizzle(client) as unknown as Database;

describe.skipIf(!url)("access services (integration)", () => {
  beforeAll(async () => {
    await client`create table if not exists files_access_path (
      id bigint primary key default next_id(),
      public_id text not null unique,
      created_at bigint not null default 0, created_by bigint,
      updated_at bigint not null default 0, updated_by bigint,
      resource_type text not null default 'static',
      access_name text, write_access boolean not null default false,
      path text not null default '', allow_sub_path_access boolean not null default true
    )`;
    await client`create table if not exists files_secured_access_key (
      id bigint primary key default next_id(),
      public_id text not null unique,
      created_at bigint not null default 0, created_by bigint,
      updated_at bigint not null default 0, updated_by bigint,
      path text not null, access_key text not null unique,
      access_till bigint not null, access_limit bigint,
      accessed_count bigint not null default 0
    )`;
  });

  beforeEach(async () => {
    await client`truncate table files_access_path restart identity`;
    await client`truncate table files_secured_access_key restart identity`;
  });

  afterAll(async () => {
    await client`drop table if exists files_access_path`;
    await client`drop table if exists files_secured_access_key`;
    await client.end();
  });

  it("static is public-read; secured needs a matching access row", async () => {
    const svc = new AccessPathService(db);
    expect(await svc.canRead("user", "any/thing", "static")).toBe(true);
    expect(await svc.canRead("user", "docs/x.pdf", "secured")).toBe(false);
    await client`insert into files_access_path (public_id, resource_type, access_name, path, allow_sub_path_access)
      values ('fap_1', 'secured', 'member', 'docs', true)`;
    expect(await svc.canRead("member", "docs/x.pdf", "secured")).toBe(true);
    expect(await svc.canRead("user", "docs/x.pdf", "secured")).toBe(false);
  });

  it("write needs write_access true", async () => {
    const svc = new AccessPathService(db);
    await client`insert into files_access_path (public_id, resource_type, access_name, write_access, path)
      values ('fap_2', 'static', 'admin', true, 'uploads')`;
    expect(await svc.canWrite("admin", "uploads/a.png", "static")).toBe(true);
    expect(await svc.canWrite("member", "uploads/a.png", "static")).toBe(false);
  });

  it("mint then validate honors expiry and limit", async () => {
    let t = 1000;
    const svc = new SecuredAccessService(db, () => t);
    const { accessKey } = await svc.mint("docs/x.pdf", { ttlSeconds: 10, limit: 1 });
    expect(await svc.validate(accessKey, "docs/x.pdf")).toEqual({ ok: true });
    expect(await svc.validate(accessKey, "docs/x.pdf")).toEqual({ ok: false, reason: "exhausted" });

    const { accessKey: k2 } = await svc.mint("docs/y.pdf", { ttlSeconds: 10 });
    t = 999_999;
    expect(await svc.validate(k2, "docs/y.pdf")).toEqual({ ok: false, reason: "expired" });

    expect(await svc.validate("nope", "docs/y.pdf")).toEqual({ ok: false, reason: "not_found" });
  });
});
```

- [ ] **Step 2: Run it (fails — no modules)**

Run: `DATABASE_URL=<seeded test db url> pnpm --filter @tiffin/commons-files test access.service`
Expected: FAIL — cannot resolve `./access-path.service`.

- [ ] **Step 3: Implement `AccessPathService`**

`packages/commons-files/src/services/access-path.service.ts`:
```ts
import type { Database } from "@tiffin/commons-drizzle";
import { and, eq } from "drizzle-orm";
import { filesAccessPath } from "../schema/files";

export type RoleValue = "admin" | "member" | "user";
type ResourceType = "static" | "secured";
type Row = typeof filesAccessPath.$inferSelect;

export class AccessPathService {
  constructor(private readonly db: Database) {}

  async canRead(role: RoleValue, path: string, resourceType: ResourceType = "static"): Promise<boolean> {
    if (resourceType === "static") return true; // static assets are public-read
    return this.matches(role, path, resourceType, false);
  }

  async canWrite(role: RoleValue, path: string, resourceType: ResourceType = "static"): Promise<boolean> {
    return this.matches(role, path, resourceType, true);
  }

  private async matches(role: RoleValue, path: string, resourceType: ResourceType, needWrite: boolean): Promise<boolean> {
    const rows = (await this.db
      .select()
      .from(filesAccessPath)
      .where(eq(filesAccessPath.resourceType, resourceType))) as Row[];
    return rows.some((r) => {
      if (needWrite && !r.writeAccess) return false;
      if (r.accessName != null && r.accessName !== role) return false;
      if (r.path === path) return true;
      return r.allowSubPathAccess && path.startsWith(`${r.path}/`);
    });
  }
}
```

- [ ] **Step 4: Implement `SecuredAccessService`**

`packages/commons-files/src/services/secured-access.service.ts`:
```ts
import type { Database } from "@tiffin/commons-drizzle";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { filesSecuredAccessKey } from "../schema/files";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const newKey = customAlphabet(ALPHABET, 15);

type Row = typeof filesSecuredAccessKey.$inferSelect;
export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "exhausted" | "path_mismatch" };

export class SecuredAccessService {
  // now() injectable so tests don't need Date.now().
  constructor(private readonly db: Database, private readonly now: () => number = () => Date.now()) {}

  async mint(path: string, opts: { ttlSeconds: number; limit?: number }): Promise<{ accessKey: string }> {
    const accessKey = newKey();
    await this.db.insert(filesSecuredAccessKey).values({
      path,
      accessKey,
      accessTill: this.now() + opts.ttlSeconds * 1000,
      accessLimit: opts.limit ?? null,
      publicId: `fsk_${accessKey}`,
    } as never);
    return { accessKey };
  }

  async validate(accessKey: string, path: string): Promise<ValidateResult> {
    const [row] = (await this.db
      .select()
      .from(filesSecuredAccessKey)
      .where(eq(filesSecuredAccessKey.accessKey, accessKey))
      .limit(1)) as Row[];
    if (!row) return { ok: false, reason: "not_found" };
    if (row.path !== path && !path.startsWith(`${row.path}/`)) return { ok: false, reason: "path_mismatch" };
    if (this.now() > row.accessTill) return { ok: false, reason: "expired" };

    // Atomic bump: only succeeds while under the limit (null = unlimited).
    const bumped = await this.db
      .update(filesSecuredAccessKey)
      .set({ accessedCount: sql`${filesSecuredAccessKey.accessedCount} + 1` })
      .where(
        and(
          eq(filesSecuredAccessKey.accessKey, accessKey),
          or(
            isNull(filesSecuredAccessKey.accessLimit),
            lt(filesSecuredAccessKey.accessedCount, filesSecuredAccessKey.accessLimit),
          ),
        ),
      )
      .returning({ id: filesSecuredAccessKey.id });
    return bumped.length ? { ok: true } : { ok: false, reason: "exhausted" };
  }
}
```

- [ ] **Step 5: Export from the barrel and run the tests**

Append to `packages/commons-files/src/index.ts`:
```ts
export * from "./services/access-path.service";
export * from "./services/secured-access.service";
```

Run: `DATABASE_URL=<seeded test db url> pnpm --filter @tiffin/commons-files test access.service`
Expected: PASS (3 tests).

- [ ] **Step 6: Full package test + typecheck**

Run: `pnpm --filter @tiffin/commons-files typecheck`
Run: `DATABASE_URL=<seeded test db url> pnpm --filter @tiffin/commons-files test`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add packages/commons-files
git commit -m "feat(commons-files): access-path RBAC + secured-key access services"
```

---

### Task 6: App wiring — schema re-export, migration, env factory

**Files:**
- Create: `apps/web/db/schema/files.ts`
- Create: `apps/web/lib/files/index.ts`
- Modify: `apps/web/db/schema/index.ts`, `apps/web/package.json`
- Generated: `apps/web/db/migrations/*`

**Interfaces:**
- Consumes: everything exported from `@tiffin/commons-files`.
- Produces: `filesService` / `filesAccess` / `filesSecuredAccess` singletons from `apps/web/lib/files`.

- [ ] **Step 1: Add the workspace dependency**

Edit `apps/web/package.json` dependencies, add:
```json
"@tiffin/commons-files": "workspace:*",
```
Run: `pnpm install`

- [ ] **Step 2: Re-export the schema into the app**

`apps/web/db/schema/files.ts`:
```ts
export {
  fileResourceType,
  fileSystemNodeType,
  fileSystem,
  filesAccessPath,
  filesSecuredAccessKey,
} from "@tiffin/commons-files";
```

Append to `apps/web/db/schema/index.ts`:
```ts
export * from "./files";
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter web db:generate`
Expected: a new migration under `apps/web/db/migrations/` creating `files_file_system`, `files_access_path`, `files_secured_access_key`, the two enums, indexes, and the self-FK. Inspect it — confirm the three tables + `parent_id` self-reference with `on delete cascade` are present.

- [ ] **Step 4: Apply and verify the migration**

Run: `pnpm --filter web db:migrate`
Expected: applies cleanly. Verify:
Run: `psql "$DATABASE_URL" -c "\d files_file_system"`
Expected: shows `parent_id` FK to `files_file_system(id)` and the three indexes.

- [ ] **Step 5: Write the env-driven factory**

`apps/web/lib/files/index.ts`:
```ts
import {
  AccessPathService,
  FileSystemService,
  S3StorageProvider,
  SecuredAccessService,
} from "@tiffin/commons-files";
import { db } from "@/db/client";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const storage = new S3StorageProvider({
  bucket: required("FILES_S3_BUCKET"),
  region: process.env.FILES_S3_REGION ?? "auto",
  endpoint: process.env.FILES_S3_ENDPOINT,
  forcePathStyle: process.env.FILES_S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: required("FILES_S3_ACCESS_KEY_ID"),
    secretAccessKey: required("FILES_S3_SECRET_ACCESS_KEY"),
  },
});

export const filesService = new FileSystemService(storage, db, {
  publicBaseUrl: process.env.FILES_PUBLIC_BASE_URL,
});
export const filesAccess = new AccessPathService(db);
export const filesSecuredAccess = new SecuredAccessService(db);
```

- [ ] **Step 6: Typecheck the app**

Run: `pnpm --filter web typecheck`
Expected: PASS. (The factory throws only at call time if env is unset, so typecheck/build do not require the env vars.)

- [ ] **Step 7: Document the env vars**

Append to `apps/web/.env.example` (create if absent):
```
FILES_S3_BUCKET=
FILES_S3_REGION=auto
FILES_S3_ENDPOINT=
FILES_S3_FORCE_PATH_STYLE=true
FILES_S3_ACCESS_KEY_ID=
FILES_S3_SECRET_ACCESS_KEY=
FILES_PUBLIC_BASE_URL=
```

- [ ] **Step 8: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): wire commons-files (schema, migration, storage factory)"
```

---

## Self-Review

**Spec coverage:**
- §1 Storage (multi-cloud) → Task 2 (interface + `S3StorageProvider` endpoint/forcePathStyle + memory fake). ✓
- §2 Model (`FileDetail`, `parseName`) → Task 1. ✓
- §3 Schema (three tables, no `client_code`, epoch-ms) → Task 3 + migration Task 6. ✓
- §4 `FileSystemService` / `AccessPathService` / `SecuredAccessService` → Tasks 4, 5. ✓
- §5 App wiring (re-export, migration, env factory, no entity migrated) → Task 6. ✓
- Out-of-scope (zip, image-transform, `filesUploadDownload`, entity migration) → absent from all tasks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `StorageProvider` signatures identical across `types.ts`, `memory-provider.ts`, `s3-provider.ts`, and `FileSystemService` usage. `RoleValue` union consistent (Task 5). `fileSystemNodeType` enum name used consistently in schema (Task 3) and reflected in `FileSystemService` `fileType` reads (Task 4). `FileDetail` shape defined once (Task 1), consumed in Task 4. Service constructor shapes in the Produces blocks match the factory calls in Task 6. ✓

## Success Criteria

- `pnpm --filter @tiffin/commons-files typecheck` and `test` (with `DATABASE_URL`) pass.
- Migration creates the three tables; `\d files_file_system` shows the self-FK + indexes.
- `apps/web` typechecks with the new factory; no existing entity/route changed.
- Storage verified against the in-memory fake in CI and (manually) one real S3-compatible endpoint.
