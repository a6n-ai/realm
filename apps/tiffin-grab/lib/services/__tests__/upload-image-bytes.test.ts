import { beforeEach, describe, expect, it, vi } from "vitest";

const created: { path: string; contentType: string }[] = [];
const store = { create: async (path: string, _b: Uint8Array, o: { contentType: string }) => (created.push({ path, contentType: o.contentType }), { filePath: path, url: path }) };
vi.mock("@/lib/files", () => ({ filesService: () => store, securedFilesService: () => store, filesSecuredAccess: () => ({}) }));

const { uploadPaymentProof } = await import("../payment-proof");
const { uploadAttachments } = await import("../ticket-attachments");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const file = (bytes: Uint8Array | string, name: string, type: string) => new File([bytes], name, { type });

describe("uploads judge the bytes, not the claimed type", () => {
  beforeEach(() => (created.length = 0));

  it("payment proof: a PDF renamed to .png is rejected and nothing is stored", async () => {
    await expect(uploadPaymentProof("pay_1", file("%PDF-1.7 fake", "IMG_2547.png", "image/png"), file(PNG, "t.webp", "image/webp"))).rejects.toThrow("Only PNG, JPEG, WebP or GIF");
    expect(created).toEqual([]);
  });

  it("payment proof: a real PNG is stored with its sniffed type even if the browser mislabels it", async () => {
    const proof = await uploadPaymentProof("pay_1", file(PNG, "shot.png", "application/octet-stream"), file(PNG, "t.png", "image/png"));
    expect(proof).not.toBeNull();
    expect(created.map((c) => c.contentType)).toEqual(["image/png", "image/png"]);
  });

  it("ticket: one bad photo among good ones stores none of them", async () => {
    await expect(
      uploadAttachments("tkt_1", [file(PNG, "a.png", "image/png"), file("<script>", "b.png", "image/png")], [file(PNG, "ta.png", "image/png"), file(PNG, "tb.png", "image/png")]),
    ).rejects.toThrow("Only PNG, JPEG, WebP or GIF");
    expect(created).toEqual([]);
  });
});
