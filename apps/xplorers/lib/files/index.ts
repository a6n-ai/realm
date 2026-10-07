import {
  AccessPathService,
  FileSystemService,
  LocalStorageProvider,
  S3StorageProvider,
  SecuredAccessService,
  type StorageProvider,
} from "@foundry/storage";
import { db } from "@/db/client";

// Storage env. If FILES_S3_BUCKET is set, use S3 (AWS S3, Cloudflare R2, MinIO,
// Backblaze); otherwise fall back to on-disk LocalStorageProvider so files work
// before S3 is configured.
//   FILES_S3_BUCKET             set to enable S3 (else local disk is used)
//   FILES_S3_REGION             default "auto"
//   FILES_S3_ENDPOINT           set for R2/MinIO/Backblaze; omit for AWS S3
//   FILES_S3_FORCE_PATH_STYLE   "true" for MinIO / most non-AWS endpoints
//   FILES_S3_ACCESS_KEY_ID      omit on AWS to use the instance role
//   FILES_S3_SECRET_ACCESS_KEY  omit on AWS to use the instance role
//   FILES_LOCAL_DIR             local-disk base dir (default ".files-storage")
//   FILES_PUBLIC_BASE_URL       public base for static file URLs
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function s3Credentials(): { accessKeyId: string; secretAccessKey: string } | undefined {
  const accessKeyId = process.env.FILES_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FILES_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

export function makeStorage(): StorageProvider {
  if (process.env.FILES_S3_BUCKET) {
    return new S3StorageProvider({
      bucket: required("FILES_S3_BUCKET"),
      region: process.env.FILES_S3_REGION ?? "auto",
      endpoint: process.env.FILES_S3_ENDPOINT,
      forcePathStyle: process.env.FILES_S3_FORCE_PATH_STYLE === "true",
      credentials: s3Credentials(),
    });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FILES_S3_BUCKET is not set — refusing to store files on ephemeral container disk");
  }
  return new LocalStorageProvider(process.env.FILES_LOCAL_DIR ?? ".files-storage");
}

let cached: FileSystemService | undefined;
export function filesService(): FileSystemService {
  if (!cached) {
    cached = new FileSystemService(makeStorage(), db, {
      publicBaseUrl: process.env.FILES_PUBLIC_BASE_URL ?? "/api/files",
      // Static files under public/* so a CDN can be scoped there without
      // reaching secured ticket originals under tickets/*.
      keyPrefix: "public",
    });
  }
  return cached;
}

let securedCached: FileSystemService | undefined;
export function securedFilesService(): FileSystemService {
  if (!securedCached) {
    securedCached = new FileSystemService(makeStorage(), db, {
      resourceType: "secured",
      signedUrlTtlSeconds: 3600,
    });
  }
  return securedCached;
}

export const filesAccess = new AccessPathService(db);
export const filesSecuredAccess = new SecuredAccessService(db);
