import { describe, expect, it } from "vitest";
import { MemoryStorageProvider } from "./memory-provider";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("MemoryStorageProvider (StorageProvider contract)", () => {
  it("round-trips put -> head -> get", async () => {
    const s = new MemoryStorageProvider();
    const put = await s.put("a/b.txt", enc("hello"), { contentType: "text/plain" });
    expect(put).toMatchObject({ key: "a/b.txt", size: 5 });
    const head = await s.head("a/b.txt");
    expect(head).toMatchObject({ size: 5, contentType: "text/plain" });
    const got = await s.get("a/b.txt");
    expect(dec(got.body)).toBe("hello");
  });

  it("head returns null for a missing key", async () => {
    const s = new MemoryStorageProvider();
    expect(await s.head("nope")).toBeNull();
  });

  it("lists by prefix with a delimiter into keys + commonPrefixes", async () => {
    const s = new MemoryStorageProvider();
    await s.put("d/1.txt", enc("1"));
    await s.put("d/sub/2.txt", enc("2"));
    const res = await s.list("d/", { delimiter: "/" });
    expect(res.keys).toEqual(["d/1.txt"]);
    expect(res.commonPrefixes).toEqual(["d/sub/"]);
  });

  it("copies then deletes", async () => {
    const s = new MemoryStorageProvider();
    await s.put("x", enc("v"));
    await s.copy("x", "y");
    expect(dec((await s.get("y")).body)).toBe("v");
    await s.delete("x");
    expect(await s.head("x")).toBeNull();
  });
});
