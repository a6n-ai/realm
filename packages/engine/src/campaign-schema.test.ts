import { describe, expect, it } from "vitest";
import { getTableConfig, pgEnum } from "drizzle-orm/pg-core";
import { makeCampaignTables } from "./campaign-schema";

const locale = pgEnum("locale", ["en", "fr"]);
const t = makeCampaignTables({ locale });

function columns(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name).sort();
}

describe("makeCampaignTables", () => {
  it("names the tables as the apps expect", () => {
    expect(getTableConfig(t.campaign).name).toBe("campaign");
    expect(getTableConfig(t.campaignContent).name).toBe("campaign_content");
    expect(getTableConfig(t.contactList).name).toBe("contact_list");
    expect(getTableConfig(t.contactListMember).name).toBe("contact_list_member");
  });

  it("stores the audience as a definition and the channels as a set", () => {
    expect(columns(t.campaign)).toEqual(
      expect.arrayContaining(["audience", "channels", "status", "scheduled_at", "counts"]),
    );
  });

  it("requires consent provenance on a contact list", () => {
    const byName = new Map(getTableConfig(t.contactList).columns.map((c) => [c.name, c]));
    expect(byName.get("consent_source")!.notNull).toBe(true);
    expect(byName.get("consent_at")!.notNull).toBe(true);
  });

  it("lets a list member carry merge fields and an unsubscribe stamp", () => {
    expect(columns(t.contactListMember)).toEqual(
      expect.arrayContaining(["email", "phone", "name", "vars", "unsubscribed_at", "list_id"]),
    );
  });

  it("mirrors the notification_template shape on campaign_content", () => {
    expect(columns(t.campaignContent)).toEqual(
      expect.arrayContaining([
        "campaign_id",
        "channel",
        "locale",
        "subject",
        "body",
        "html",
        "text",
        "provider_template_id",
      ]),
    );
  });
});
