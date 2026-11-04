import { afterEach, describe, expect, it, vi } from "vitest";
import { protectThumbnail } from "./protect-thumbnail";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@opennextjs/cloudflare");
});

const bytes = new Uint8Array([1, 2, 3]);

function workers(output: () => Promise<{ response(): Response }>) {
  vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  const calls: Record<string, unknown> = {};
  const chain = {
    transform: (o: unknown) => ((calls.transform = o), chain),
    draw: (_ov: unknown, o: unknown) => ((calls.draw = o), chain),
    output: (o: unknown) => ((calls.output = o), output()),
  };
  const env = {
    IMAGES: { input: () => chain },
    ASSETS: { fetch: async () => new Response(new Uint8Array([9])) },
  };
  vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));
  return calls;
}

describe("protectThumbnail", () => {
  it("returns the input unchanged off Workers", async () => {
    expect(await protectThumbnail(bytes, "image/png")).toEqual({ bytes, contentType: "image/png" });
  });

  it("blurs, tiles the watermark and outputs webp on Workers", async () => {
    const calls = workers(async () => ({ response: () => new Response(new Uint8Array([7, 7])) }));
    const { protectThumbnail: p } = await import("./protect-thumbnail");
    const out = await p(bytes, "image/png");
    expect(calls).toEqual({ transform: { blur: 12 }, draw: { opacity: 0.35, repeat: true }, output: { format: "image/webp" } });
    expect(out.contentType).toBe("image/webp");
    expect([...out.bytes]).toEqual([7, 7]);
  });

  it("throws when IMAGES fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    workers(async () => {
      throw new Error("boom");
    });
    const { protectThumbnail: p } = await import("./protect-thumbnail");
    await expect(p(bytes, "image/png")).rejects.toThrow("Could not process");
  });
});
