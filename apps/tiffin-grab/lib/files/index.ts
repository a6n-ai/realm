import {
  AccessPathService,
  FileSystemService,
  LocalStorageProvider,
  S3StorageProvider,
  SecuredAccessService,
  type StorageProvider,
} from "@tiffin/commons-files";
import { db } from "@/db/client";

// Storage env. If FILES_S3_BUCKET is set, use S3 (AWS S3, Cloudflare R2, MinIO,
// Backblaze); otherwise fall back to on-disk LocalStorageProvider so files work
// before S3 is configured. (.env.example is not writable here — this is the doc.)
//   FILES_S3_BUCKET             set to enable S3 (else local disk is used)
//   FILES_S3_REGION             default "auto"
//   FILES_S3_ENDPOINT           set for R2/MinIO/Backblaze; omit for AWS S3
//   FILES_S3_FORCE_PATH_STYLE   "true" for MinIO / most non-AWS endpoints
//   FILES_S3_ACCESS_KEY_ID      required when S3 is enabled
//   FILES_S3_SECRET_ACCESS_KEY  required when S3 is enabled
//   FILES_LOCAL_DIR             local-disk base dir (default ".files-storage")
//   FILES_PUBLIC_BASE_URL       public base for static file URLs
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function makeStorage(): StorageProvider {
  if (process.env.FILES_S3_BUCKET) {
    return new S3StorageProvider({
      bucket: required("FILES_S3_BUCKET"),
      region: process.env.FILES_S3_REGION ?? "auto",
      endpoint: process.env.FILES_S3_ENDPOINT,
      forcePathStyle: process.env.FILES_S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: required("FILES_S3_ACCESS_KEY_ID"),
        secretAccessKey: required("FILES_S3_SECRET_ACCESS_KEY"),
      },
    });
  }
  return new LocalStorageProvider(process.env.FILES_LOCAL_DIR ?? ".files-storage");
}

// Lazy: storage is only built when first needed, so importing filesAccess /
// filesSecuredAccess (which need no storage) never trips required().
let cached: FileSystemService | undefined;
export function filesService(): FileSystemService {
  if (!cached) {
    cached = new FileSystemService(makeStorage(), db, {
      publicBaseUrl: process.env.FILES_PUBLIC_BASE_URL ?? "/api/files",
    });
  }
  return cached;
}

// These need only db — safe to construct eagerly (no S3 env required).
export const filesAccess = new AccessPathService(db);
export const filesSecuredAccess = new SecuredAccessService(db);
