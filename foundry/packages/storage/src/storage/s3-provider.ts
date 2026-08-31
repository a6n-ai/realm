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
