import { UpdatableRepository, type Database } from "@realm/database";
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
  // Physical key namespace prepended to every created object, e.g. "public".
  // Keeps CDN-served static files under one prefix so a CloudFront/bucket-policy
  // scope like "public/*" can never reach a `secured` object that lives outside
  // it (see deployment/cdn/). Applied at create() only; reads use the stored
  // path, so existing objects are unaffected.
  keyPrefix?: string;
}

// Storage key = path without a leading slash.
const toKey = (path: string): string => (normalizePath(path) ?? "").replace(/^\/+/, "");

export class FileSystemService {
  private readonly repo: UpdatableRepository<typeof fileSystem>;
  private readonly resourceType: ResourceType;
  private readonly publicBaseUrl?: string;
  private readonly ttl: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly storage: StorageProvider,
    private readonly db: Database,
    opts: FileSystemServiceOptions = {},
  ) {
    this.repo = new UpdatableRepository(db, fileSystem, fileSystem.publicId, fileSystem.id);
    this.resourceType = opts.resourceType ?? "static";
    this.publicBaseUrl = opts.publicBaseUrl;
    this.ttl = opts.signedUrlTtlSeconds ?? 3600;
    this.keyPrefix = (opts.keyPrefix ?? "").replace(/^\/+|\/+$/g, "");
  }

  async create(path: string, body: Uint8Array | string, opts?: { contentType?: string }): Promise<FileDetail> {
    const base = toKey(path);
    const key = this.keyPrefix ? `${this.keyPrefix}/${base}` : base;
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
    return this.toFileDetail(row, row.fileType === "file" ? await this.urlFor(key) : undefined);
  }

  async get(path: string): Promise<GetResult> {
    return this.storage.get(toKey(path));
  }

  async list(dirPath: string): Promise<FileDetail[]> {
    const key = toKey(dirPath);
    let parentId: bigint | null = null;
    if (key !== "") {
      const dir = await this.rowByPath(key);
      if (!dir) return [];
      parentId = dir.id;
    }
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

  // ponytail: deletes one object + its row (descendant rows cascade via FK). Deleting a non-empty directory leaves descendant blobs in storage — add prefix-based storage GC (storage.list(key) + delete) when directory delete is actually needed.
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
