import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StorageDriver } from "./index";

const DIR = join(process.cwd(), "public", "uploads", "avatars");

// Keys must be bare filenames (callers generate them server-side). Guard anyway —
// this driver is the last line of defense against path traversal.
function assertBareKey(key: string): void {
  if (!key || key.includes("/") || key.includes("\\") || key.includes("..")) {
    throw new Error(`invalid storage key: ${key}`);
  }
}

export class LocalStorageDriver implements StorageDriver {
  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<string> {
    assertBareKey(key);
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, key), bytes);
    return `/uploads/avatars/${key}`;
  }
  async delete(key: string): Promise<void> {
    assertBareKey(key);
    await rm(join(DIR, key), { force: true });
  }
}
