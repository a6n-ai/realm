import { createStorageFromEnv } from "@foundry/storage/from-env";
import { cfEnv } from "@/lib/runtime/cf-env";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fileSystem } from "@/db/schema";
import { filesPublicBaseUrl, isProduction } from "@/lib/runtime/env";

const storage = createStorageFromEnv({
  db,
  filesPublicBaseUrl,
  isProduction,
  signedBaseUrl: "https://files.tiffingrab.ca",
  getR2Binding: () => cfEnv().FILES,
});

export const { makeStorage, filesService, securedFilesService, filesAccess, filesSecuredAccess } = storage;

/** Path is not unique, so probe for a secured row specifically: a colliding static row must never bypass the token gate. */
export async function isSecured(path: string): Promise<boolean> {
  const [row] = await db
    .select({ id: fileSystem.id })
    .from(fileSystem)
    .where(and(eq(fileSystem.path, path), eq(fileSystem.resourceType, "secured")))
    .limit(1);
  return Boolean(row);
}
