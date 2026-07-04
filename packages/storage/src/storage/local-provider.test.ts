import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "./local-provider";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("LocalStorageProvider (StorageProvider contract)", () => {
  let dir: string;
  let s: LocalStorageProvider;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "commons-files-local-"));
    s = new LocalStorageProvider(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips put -> head -> get with inferred content type", async () => {
    const put = await s.put("a/b.txt", enc("hello"));
    expect(put).toMatchObject({ key: "a/b.txt", size: 5 });
    const head = await s.head("a/b.txt");
    expect(head).toMatchObject({ size: 5, contentType: "text/plain" });
    const got = await s.get("a/b.txt");
    expect(dec(got.body)).toBe("hello");
    expect(got.contentType).toBe("text/plain");
  });

  it("head returns null for a missing key", async () => {
    expect(await s.head("nope")).toBeNull();
  });

  it("lists by prefix with a delimiter into keys + commonPrefixes", async () => {
    await s.put("d/1.txt", enc("1"));
    await s.put("d/sub/2.txt", enc("2"));
    const res = await s.list("d/", { delimiter: "/" });
    expect(res.keys).toEqual(["d/1.txt"]);
    expect(res.commonPrefixes).toEqual(["d/sub/"]);
  });

  it("copies then deletes", async () => {
    await s.put("x", enc("v"));
    await s.copy("x", "y");
    expect(dec((await s.get("y")).body)).toBe("v");
    await s.delete("x");
    expect(await s.head("x")).toBeNull();
  });

  it("delete on a missing key is a no-op", async () => {
    await expect(s.delete("gone")).resolves.toBeUndefined();
  });

  it("blocks reads that escape the base directory via ..", async () => {
    await expect(s.get("../escape.txt")).rejects.toThrow(/escape/i);
  });

  it("blocks writes that escape the base directory via ..", async () => {
    await expect(s.put("../../evil.txt", enc("x"))).rejects.toThrow();
  });

  it("still allows a normal nested key", async () => {
    await s.put("a/b/c.txt", enc("ok"));
    expect(dec((await s.get("a/b/c.txt")).body)).toBe("ok");
  });
});
