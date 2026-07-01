import {
  AccessPathService,
  FileSystemService,
  S3StorageProvider,
  SecuredAccessService,
} from "@tiffin/commons-files";
import { db } from "@/db/client";

// Storage env (S3-compatible: AWS S3, Cloudflare R2, MinIO, Backblaze).
// (.env.example is not writable here — this block is the in-repo doc.)
//   FILES_S3_BUCKET             required
//   FILES_S3_REGION             default "auto"
//   FILES_S3_ENDPOINT           set for R2/MinIO/Backblaze; omit for AWS S3
//   FILES_S3_FORCE_PATH_STYLE   "true" for MinIO / most non-AWS endpoints
//   FILES_S3_ACCESS_KEY_ID      required
//   FILES_S3_SECRET_ACCESS_KEY  required
//   FILES_PUBLIC_BASE_URL       public base for static file URLs
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Lazy: the S3 env is only read when storage is first needed, so importing
// filesAccess / filesSecuredAccess (which need no S3) never trips required().
let cached: FileSystemService | undefined;
export function filesService(): FileSystemService {
  if (!cached) {
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
    cached = new FileSystemService(storage, db, {
      publicBaseUrl: process.env.FILES_PUBLIC_BASE_URL,
    });
  }
  return cached;
}

// These need only db — safe to construct eagerly (no S3 env required).
export const filesAccess = new AccessPathService(db);
export const filesSecuredAccess = new SecuredAccessService(db);
