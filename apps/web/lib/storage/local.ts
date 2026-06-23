import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StorageDriver } from "./index";

const DIR = join(process.cwd(), "public", "uploads", "avatars");

export class LocalStorageDriver implements StorageDriver {
  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<string> {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, key), bytes);
    return `/uploads/avatars/${key}`;
  }
  async delete(key: string): Promise<void> {
    await rm(join(DIR, key), { force: true });
  }
}
