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
