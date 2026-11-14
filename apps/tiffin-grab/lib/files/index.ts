import { createStorageFromEnv } from "@foundry/storage/from-env";
import { cfEnv } from "@/lib/runtime/cf-env";
import { db } from "@/db/client";
import { filesPublicBaseUrl, isProduction } from "@/lib/runtime/env";

const storage = createStorageFromEnv({
  db,
  filesPublicBaseUrl,
  isProduction,
  signedBaseUrl: "https://files.tiffingrab.ca",
  getR2Binding: () => cfEnv().FILES,
});

export const { makeStorage, filesService, securedFilesService, filesAccess, filesSecuredAccess } = storage;
