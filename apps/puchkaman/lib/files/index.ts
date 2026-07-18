import { FileSystemService, LocalStorageProvider, S3StorageProvider, type StorageProvider } from "@realm/storage";
import { db } from "@/db/client";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function s3Credentials() {
  const accessKeyId = process.env.FILES_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FILES_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

function makeStorage(): StorageProvider {
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
    });
  }
  return cached;
}
