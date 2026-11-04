import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

let allowed = false;
const mint = vi.fn(async (_p: string, _o: { ttlSeconds: number; limit?: number }) => ({ accessKey: `k${mint.mock.calls.length}` }));
vi.mock("@/lib/files", () => ({ filesSecuredAccess: { mint: (p: string, o: { ttlSeconds: number; limit?: number }) => mint(p, o) }, securedFilesService: () => ({}) }));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: async () => {
    if (!allowed) throw new ForbiddenError();
  },
}));

const { attachmentLinks, mintFolderAccess, withAttachmentViews, proofView } = await import("../ticket-attachments");

const att = (n: number) => ({ path: `tickets/T1/n${n}/orig-a.png`, thumbPath: `tickets/T1/n${n}/thumb-a.png`, name: `a${n}.png` });
const messages = [{ attachments: [att(1), att(2)] }, { attachments: [att(3)] }, { attachments: null }];

beforeEach(() => {
  mint.mockClear();
});

describe("attachment links", () => {
  it("bulk permission: one folder token per ticket, shared ak, scaled limit", async () => {
    allowed = true;
    const out = await withAttachmentViews(messages);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledWith("tickets/T1", { ttlSeconds: 3600, limit: 16 });
    const a = out[0].attachments![0];
    expect(a.href).toBe("/api/files/tickets/T1/n1/orig-a.png?ak=k1");
    expect(a.thumbUrl).toBe("/api/files/tickets/T1/n1/thumb-a.png?ak=k1");
    expect(out[2].attachments).toBeNull();
  });

  it("without it: one token per attachment folder, original and thumb share it", async () => {
    allowed = false;
    const out = await withAttachmentViews(messages);
    expect(mint).toHaveBeenCalledTimes(3);
    expect(mint.mock.calls.map((c) => c[0]).sort()).toEqual(["tickets/T1/n1", "tickets/T1/n2", "tickets/T1/n3"]);
    const a = out[0].attachments![0];
    expect(a.href.split("ak=")[1]).toBe(a.thumbUrl.split("ak=")[1]);
    expect(out[0].attachments![1].href).not.toBe(a.href.replace("n1", "n2"));
  });

  it("payment proof: bulk mints once for payments/<id>", async () => {
    allowed = true;
    await proofView({ path: "payments/P9/zz/orig-s.png", thumbPath: "payments/P9/zz/thumb-s.png", name: "s.png" });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0][0]).toBe("payments/P9");
  });

  it("legacy rows keep their public thumbUrl", async () => {
    allowed = false;
    const v = await proofView({ path: "payments/P9/zz/orig-s.png", thumbUrl: "https://cdn/t.png", name: "s.png" });
    expect(v?.thumbUrl).toBe("https://cdn/t.png");
    expect(v?.href).toContain("/api/files/payments/P9/zz/orig-s.png?ak=");
  });

  it("mintFolderAccess throws without the permission and refuses a bare prefix", async () => {
    allowed = false;
    await expect(mintFolderAccess("tickets/T1", 1)).rejects.toThrow();
    allowed = true;
    await expect(mintFolderAccess("tickets", 1)).rejects.toThrow("Not an entity folder");
    await expect(attachmentLinks("tickets/T1", [])).resolves.toBeTypeOf("function");
  });
});
