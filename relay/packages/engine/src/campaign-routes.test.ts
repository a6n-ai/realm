import { describe, expect, it, vi } from "vitest";
import { setCampaignContent } from "./campaign-routes";

function fakeDeps(campaignRow: { id: bigint; status: string } | undefined) {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(campaignRow ? [campaignRow] : []),
      }),
    }),
    insert: vi.fn().mockReturnValue(insertChain),
  };
  return { db, tables: { campaign: {}, campaignContent: {} }, users: {}, resolveSegment: vi.fn() } as any;
}

describe("setCampaignContent", () => {
  it("rejects editing content on a sent campaign", async () => {
    const deps = fakeDeps({ id: 1n, status: "sent" });
    const result = await setCampaignContent(deps, "cmp_1", {
      channel: "email",
      locale: "en",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({
      error: "Content can only be edited while a campaign is draft or scheduled",
      status: 409,
    });
  });

  it("404s when the campaign does not exist", async () => {
    const deps = fakeDeps(undefined);
    const result = await setCampaignContent(deps, "cmp_missing", {
      channel: "email",
      locale: "en",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({ error: "Campaign not found", status: 404 });
  });
});
