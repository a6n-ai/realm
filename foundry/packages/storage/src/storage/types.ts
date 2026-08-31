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
