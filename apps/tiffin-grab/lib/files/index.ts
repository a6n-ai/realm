import { hmacUrlSigner } from "@foundry/cloud";
import {
  AccessPathService,
  FileSystemService,
  LocalStorageProvider,
  R2BindingStorageProvider,
  type R2BucketLike,
  S3StorageProvider,
  SecuredAccessService,
  type StorageProvider,
} from "@foundry/storage";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/db/client";

// Storage env. If the Worker has the FILES R2 binding (wrangler r2_buckets) AND
// FILES_URL_SIGNING_SECRET is set, files go through the binding with HMAC-signed
// URLs on FILES_SIGNED_BASE_URL (default https://files.tiffingrab.ca). Otherwise: if FILES_S3_BUCKET is set, use S3 (AWS S3, Cloudflare R2, MinIO,
// Backblaze); otherwise fall back to on-disk LocalStorageProvider so files work
// before S3 is configured. (.env.example is not writable here — this is the doc.)
//   FILES (binding)             R2 bucket tiffin-grab-files; read per call, never cached
//   FILES_URL_SIGNING_SECRET    HMAC secret shared with the files.tiffingrab.ca WAF rule
//   FILES_SIGNED_BASE_URL       default "https://files.tiffingrab.ca"
//   The S3 keys below are only needed for the fallback (no binding or no secret):
//   FILES_S3_BUCKET             set to enable S3 (else local disk is used)
//   FILES_S3_REGION             default "auto"
//   FILES_S3_ENDPOINT           set for R2/MinIO/Backblaze; omit for AWS S3
//   FILES_S3_FORCE_PATH_STYLE   "true" for MinIO / most non-AWS endpoints
//   FILES_S3_ACCESS_KEY_ID      required (no instance-role fallback)
//   FILES_S3_SECRET_ACCESS_KEY  required (no instance-role fallback)
//   FILES_LOCAL_DIR             local-disk base dir (default ".files-storage")
//   FILES_PUBLIC_BASE_URL       public base for static file URLs
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Static keys only when both are set. Left undefined, signing is skipped and
// every S3 call fails — there is no instance-role fallback.
function s3Credentials(): { accessKeyId: string; secretAccessKey: string } | undefined {
  const accessKeyId = process.env.FILES_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FILES_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

// Outside a Worker request (tests, `next dev`) getCloudflareContext throws; that means "no binding".
function filesBinding(): R2BucketLike | undefined {
  try {
    return (getCloudflareContext().env as unknown as { FILES?: R2BucketLike }).FILES;
  } catch {
    return undefined;
  }
}

export function makeStorage(): StorageProvider {
  const secret = process.env.FILES_URL_SIGNING_SECRET;
  const bucket = secret ? filesBinding() : undefined;
  if (secret && bucket) {
    return new R2BindingStorageProvider({
      bucket,
      signer: hmacUrlSigner({ secret, baseUrl: process.env.FILES_SIGNED_BASE_URL ?? "https://files.tiffingrab.ca" }),
    });
  }
  if (process.env.FILES_S3_BUCKET) {
    return new S3StorageProvider({
      bucket: required("FILES_S3_BUCKET"),
      // "auto" is an R2-ism; real S3 signs per-region and 400s on "auto".
      region: process.env.FILES_S3_REGION ?? "auto",
      endpoint: process.env.FILES_S3_ENDPOINT,
      forcePathStyle: process.env.FILES_S3_FORCE_PATH_STYLE === "true",
      credentials: s3Credentials(),
    });
  }
  // The container has no volume for FILES_LOCAL_DIR, so on-disk files die with it
  // on the next deploy while their file_system rows survive — silent 404s, not an
  // error. Fail loudly instead: in prod, S3 is the only correct backend.
  if (process.env.NODE_ENV === "production") {
    throw new Error("FILES_S3_BUCKET is not set — refusing to store files on ephemeral container disk");
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
      // Static files live under public/* so the files CDN can be scoped there
      // and never reach secured objects (e.g. ticket attachment originals under
      // tickets/*). See deployment/cdn/. Existing objects keep their old keys.
      keyPrefix: "public",
    });
  }
  return cached;
}

// Secured twin of filesService: rows are resourceType "secured", so reads go
// through a minted SecuredAccessService token (see the /api/files route), not a
// public URL. Used for ticket attachment originals.
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

// These need only db — safe to construct eagerly (no S3 env required).
export const filesAccess = new AccessPathService(db);
export const filesSecuredAccess = new SecuredAccessService(db);
