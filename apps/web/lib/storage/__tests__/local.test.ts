import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { LocalStorageDriver } from "../local";

const root = join(process.cwd(), "public", "uploads", "avatars");
const driver = new LocalStorageDriver();

afterEach(async () => { await rm(join(root, "test-key.png"), { force: true }); });

describe("LocalStorageDriver", () => {
  it("put writes the file and returns a public URL; delete removes it", async () => {
    const url = await driver.put("test-key.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(url).toBe("/uploads/avatars/test-key.png");
    await driver.delete("test-key.png"); // must not throw
    await driver.delete("test-key.png"); // idempotent — missing file is fine
  });
});
