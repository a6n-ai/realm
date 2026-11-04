import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

let allowed = false;
const mint = vi.fn(async (_p: string, _o: { ttlSeconds: number; limit?: number }) => ({ accessKey: `k${mint.mock.calls.length}` }));
vi.spyOn(console, "error").mockImplementation(() => {});
vi.mock("@/lib/files", () => ({ filesSecuredAccess: { mint: (p: string, o: { ttlSeconds: number; limit?: number }) => mint(p, o) }, securedFilesService: () => ({}) }));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: async () => {
    if (!allowed) throw new ForbiddenError();
  },
}));

const { attachmentLinks, mintFolderAccess, withAttachmentViews, proofView, NO_THUMB } = await import("../ticket-attachments");

const att = (n: number) => ({ path: `tickets/T1/n${n}/orig-a.png`, thumbPath: `tickets/T1/n${n}/thumb-a.png`, name: `a${n}.png` });
const messages = [{ attachments: [att(1), att(2)] }, { attachments: [att(3)] }, { attachments: null }];

beforeEach(() => {
  mint.mockClear();
});

const F = "tickets/T1";
const akOf = (u: string) => u.split("ak=")[1];

describe("attachment links", () => {
  it("bulk permission: one folder token per ticket, shared ak, scaled limit", async () => {
    allowed = true;
    const out = await withAttachmentViews(messages, F);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledWith("tickets/T1", { ttlSeconds: 3600, limit: 16 });
    const a = out[0].attachments![0];
    expect(a.href).toBe("/api/files/tickets/T1/n1/orig-a.png?ak=k1");
    expect(a.thumbUrl).toBe("/api/files/tickets/T1/n1/thumb-a.png?ak=k1");
    expect(out[2].attachments).toBeNull();
  });

  it("without it: one token per attachment folder, original and thumb share it, tokens differ per attachment", async () => {
    allowed = false;
    const out = await withAttachmentViews(messages, F);
    expect(mint).toHaveBeenCalledTimes(3);
    expect(mint.mock.calls.map((c) => c[0]).sort()).toEqual(["tickets/T1/n1", "tickets/T1/n2", "tickets/T1/n3"]);
    const [a, b] = out[0].attachments!;
    expect(akOf(a.href)).toBe(akOf(a.thumbUrl));
    expect(akOf(a.href)).not.toBe(akOf(b.href));
  });

  it("payment proof: bulk mints once for payments/<id>", async () => {
    allowed = true;
    await proofView({ path: "payments/P9/zz/orig-s.png", thumbPath: "payments/P9/zz/thumb-s.png", name: "s.png" }, ["payments/P9", "payments/O1"]);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0][0]).toBe("payments/P9");
  });

  it("legacy rows keep their public thumbUrl", async () => {
    allowed = false;
    const v = await proofView({ path: "payments/P9/zz/orig-s.png", thumbUrl: "https://cdn/t.png", name: "s.png" }, "payments/P9");
    expect(v?.thumbUrl).toBe("https://cdn/t.png");
    expect(v?.href).toContain("/api/files/payments/P9/zz/orig-s.png?ak=");
  });

  it("a row with no thumbnail never falls back to the original", async () => {
    allowed = false;
    const v = await proofView({ path: "payments/P9/zz/orig-s.png", name: "s.png" }, "payments/P9");
    expect(v?.thumbUrl).toBeNull();
    const [m] = await withAttachmentViews([{ attachments: [{ path: "tickets/T1/n1/orig-a.png", name: "a" }] }], F);
    expect(m.attachments![0].thumbUrl).toBe(NO_THUMB);
  });

  it("a malformed attachment folder is never minted", async () => {
    for (const bad of ["tickets/T1/orig-a.png", "tickets/T1/n1/deep/orig-a.png", "orig-a.png"]) {
      for (allowed of [false, true]) {
        mint.mockClear();
        expect(await proofView({ path: bad, name: "x" }, "tickets/T1")).toBeNull();
        expect(mint).not.toHaveBeenCalled();
      }
    }
  });

  it("a file outside the access-checked folder gets no link and no mint", async () => {
    for (allowed of [false, true]) {
      mint.mockClear();
      const out = await withAttachmentViews([{ attachments: [{ path: "tickets/T2/n1/orig-a.png", name: "x" }] }], F);
      expect(out[0].attachments).toEqual([]);
      expect(mint).not.toHaveBeenCalled();
    }
    expect(await proofView({ path: "payments/OTHER/zz/orig-s.png", name: "s" }, ["payments/P9", "payments/O1"])).toBeNull();
  });

  it("mintFolderAccess throws without the permission and refuses a bare prefix", async () => {
    allowed = false;
    await expect(mintFolderAccess("tickets/T1", 1)).rejects.toThrow();
    allowed = true;
    await expect(mintFolderAccess("tickets", 1)).rejects.toThrow("Not an entity folder");
    await expect(attachmentLinks("tickets/T1", [])).resolves.toBeTypeOf("function");
  });
});
