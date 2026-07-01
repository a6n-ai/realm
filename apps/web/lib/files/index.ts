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
