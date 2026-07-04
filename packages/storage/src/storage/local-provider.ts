import type { Dirent } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type {
  GetResult,
  HeadResult,
  ListOptions,
  ListResult,
  PutOptions,
  PutResult,
  StorageProvider,
} from "./types";

// Minimal extension → content-type map. Local disk has no object metadata store,
// so content type is inferred from the key's extension (undefined if unknown).
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
};

function guessContentType(key: string): string | undefined {
  const dot = key.lastIndexOf(".");
  return dot < 0 ? undefined : CONTENT_TYPES[key.slice(dot + 1).toLowerCase()];
}

const toBytes = (body: Uint8Array | string): Uint8Array =>
  typeof body === "string" ? new TextEncoder().encode(body) : body;

/**
 * Disk-backed StorageProvider. Fallback backend for local dev / tests / any
 * environment where S3 isn't configured yet — keys map to files under baseDir.
 * Not for production (no signing, no durability guarantees).
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  constructor(private readonly baseDir: string) {}

  // Keys are posix-style ("a/b/c"); resolve against baseDir with OS separators.
  // Containment check blocks ".."-style traversal outside baseDir.
  private fullPath(key: string): string {
    const root = resolve(this.baseDir);
    const full = resolve(root, ...key.split("/"));
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error(`local storage: path escapes base directory: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Uint8Array | string, _opts?: PutOptions): Promise<PutResult> {
    const bytes = toBytes(body);
    const path = this.fullPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return { key, size: bytes.byteLength };
  }

  async get(key: string): Promise<GetResult> {
    const buf = await readFile(this.fullPath(key));
    const body = new Uint8Array(buf);
    return { body, contentType: guessContentType(key), size: body.byteLength };
  }

  async head(key: string): Promise<HeadResult | null> {
    try {
      const s = await stat(this.fullPath(key));
      return { size: s.size, contentType: guessContentType(key), lastModified: s.mtimeMs };
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return null;
      throw err;
    }
  }

  async list(prefix: string, opts?: ListOptions): Promise<ListResult> {
    // Walk the whole tree, then apply the SAME string-prefix + delimiter logic as
    // MemoryStorageProvider so both backends behave identically. O(n) per call —
    // fine for a dev/test backend; production uses S3's native prefix listing.
    const allKeys = await this.walk(this.baseDir, "");
    const keys: string[] = [];
    const prefixes = new Set<string>();
    for (const k of allKeys) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const di = opts?.delimiter ? rest.indexOf(opts.delimiter) : -1;
      if (di === -1) keys.push(k);
      else prefixes.add(prefix + rest.slice(0, di + opts!.delimiter!.length));
    }
    return { keys, commonPrefixes: [...prefixes], isTruncated: false };
  }

  private async walk(dir: string, prefix: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return [];
      throw err;
    }
    const out: string[] = [];
    for (const e of entries) {
      const key = prefix === "" ? e.name : `${prefix}/${e.name}`;
      if (e.isDirectory()) out.push(...(await this.walk(join(dir, e.name), key)));
      else out.push(key);
    }
    return out;
  }

  async delete(key: string): Promise<void> {
    await rm(this.fullPath(key), { force: true });
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const to = this.fullPath(toKey);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(this.fullPath(fromKey), to);
  }

  // No signing on local disk: return a file:// URL to the on-disk path. ttl is
  // ignored. ponytail: swap for a served /files route if local dev needs HTTP URLs.
  async presignGet(key: string, _ttlSeconds: number): Promise<string> {
    return `file://${this.fullPath(key)}`;
  }

  async presignPut(key: string, _ttlSeconds: number, _opts?: PutOptions): Promise<string> {
    return `file://${this.fullPath(key)}`;
  }
}
