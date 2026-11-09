import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2BucketLike } from "@foundry/storage";
import { createStorageFromEnv } from "@foundry/storage/from-env";
import { db } from "@/db/client";
import { filesPublicBaseUrl, isProduction } from "@/lib/runtime/env";

const storage = createStorageFromEnv({
  db,
  filesPublicBaseUrl,
  isProduction,
  signedBaseUrl: "https://files.tiffingrab.ca",
  getR2Binding: () => (getCloudflareContext().env as unknown as { FILES?: R2BucketLike }).FILES,
});

export const { makeStorage, filesService, securedFilesService, filesAccess, filesSecuredAccess } = storage;
