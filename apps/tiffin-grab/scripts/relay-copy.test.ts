import { describe, expect, it } from "vitest";
import {
  mapCampaign,
  mapCampaignStatus,
  mapMember,
  mapMessage,
  mapReason,
  mapSuppression,
  mapTemplate,
  mismatches,
  splitName,
  tally,
} from "./relay-copy";

describe("mapReason", () => {
  it("maps the old reason text to Relay's four reasons", () => {
    expect(mapReason("SES hard bounce")).toBe("bounce");
    expect(mapReason("SES complaint")).toBe("complaint");
    expect(mapReason("unsubscribe")).toBe("unsubscribe");
    expect(mapReason("manual")).toBe("manual");
    expect(mapReason("something else")).toBe("manual");
  });
});

describe("mapSuppression", () => {
  it("keeps the marketing scope as a marketing stream and omits the stream for scope all", () => {
    expect(mapSuppression({ address: "A@x.ca", channel: "email", scope: "marketing", reason: "unsubscribe" })).toEqual({
      email: "a@x.ca",
      reason: "unsubscribe",
      stream: "marketing",
    });
    expect(mapSuppression({ address: "b@x.ca", channel: "email", scope: "all", reason: "SES hard bounce" })).toEqual({ email: "b@x.ca", reason: "bounce" });
  });

  it("skips sms rows and invalid addresses", () => {
    expect(mapSuppression({ address: "+15551234567", channel: "sms", scope: "all", reason: "manual" })).toBeNull();
    expect(mapSuppression({ address: "not-an-email", channel: "email", scope: "all", reason: "manual" })).toBeNull();
  });
});

describe("splitName", () => {
  it("splits at the first space and keeps the rest as last name", () => {
    expect(splitName("Ana Maria Lopez")).toEqual({ firstName: "Ana", lastName: "Maria Lopez" });
    expect(splitName("  Ana  ")).toEqual({ firstName: "Ana" });
    expect(splitName(null)).toEqual({});
  });
});

describe("mapMember", () => {
  it("skips phone-only members", () => {
    expect(mapMember({ email: null, name: "Ana", created_at: new Date(0) })).toBeNull();
  });

  it("lowercases the email, splits the name, and keeps the member created_at (epoch ms) as consentAt", () => {
    const created = new Date("2025-03-01T12:00:00Z");
    expect(mapMember({ email: "Ana@X.ca", name: "Ana Lopez", created_at: created })).toEqual({
      email: "ana@x.ca",
      firstName: "Ana",
      lastName: "Lopez",
      consentAt: created.getTime(),
    });
  });
});

describe("members import tally and verify", () => {
  it("counts Relay's added as created and folds suppressed into existing", () => {
    expect(tally({ added: 3, existing: 2, suppressed: 1 })).toEqual({ created: 3, existing: 3 });
    expect(tally({ created: 4, existing: 1 })).toEqual({ created: 4, existing: 1 });
  });

  it("passes verify when created + existing + skipped covers every source row, and reports the rest", () => {
    const ok = { members: { source: 5, created: 3, existing: 1, skipped: { no_email: 1 } } };
    expect(mismatches(ok)).toEqual([]);
    const bad = { members: { source: 5, created: 3, existing: 0, skipped: { no_email: 1 } }, lists: { source: 2, created: 2, existing: 0, skipped: {} } };
    expect(mismatches(bad)).toEqual(["members"]);
  });
});

describe("mapCampaignStatus", () => {
  it("maps completed and sent to sent, cancelled to cancelled, everything else to draft", () => {
    expect(mapCampaignStatus("completed")).toBe("sent");
    expect(mapCampaignStatus("sent")).toBe("sent");
    expect(mapCampaignStatus("cancelled")).toBe("cancelled");
    expect(mapCampaignStatus("paused")).toBe("draft");
    expect(mapCampaignStatus("scheduled")).toBe("draft");
  });
});

describe("mapCampaign", () => {
  it("maps list ids through the Relay list map and keeps only known counters", () => {
    const row = {
      public_id: "cmp_1",
      name: "Menu",
      status: "completed",
      audience: { listIds: ["ctl_a", "ctl_missing"] },
      counts: { sent: 4, queued: 4, recipients: 9 },
    };
    const out = mapCampaign(row, { subject: "Hi", html: "<p>x</p>", text: "x" }, (pub) => (pub === "ctl_a" ? "rl_1" : undefined));
    expect(out).toMatchObject({ importRef: "cmp_1", status: "sent", listIds: ["rl_1"], counters: { sent: 4, queued: 4 } });
  });
});

describe("mapTemplate", () => {
  it("names the template by event and locale, sends no intro (the engine body is editor HTML)", () => {
    const out = mapTemplate({ public_id: "ntp_1", event: "order_created", locale: "en", subject: "Hi\r\nthere", body: "<p>Lead</p>", html: "<p>h</p>", text: "t", enabled: true });
    expect(out).toMatchObject({ importRef: "ntp_1", name: "order_created:en", subject: "Hi there", intro: null, enabled: true });
  });
});

describe("mapMessage", () => {
  const base = {
    public_id: "nob_1",
    dedupe_key: "cmp:cmp_1:week:2099-01-05:42:email",
    recipient_email: "Ana@x.ca",
    channel: "email",
    kind: "transactional",
    event: "order_created",
    status: "sent",
    payload: { subject: "Your order" },
    last_error: null,
    provider_message_id: "ses-1",
    created_at: 1700000000000,
    opened_at: null,
    clicked_at: null,
    delivered_at: 1700000001000,
    bounced_at: null,
    complained_at: null,
  };

  it("copies sent and failed rows with the payload subject", () => {
    expect(mapMessage(base)).toMatchObject({ toEmail: "ana@x.ca", stream: "transactional", subject: "Your order", status: "sent", deliveredAt: 1700000001000 });
    expect(mapMessage({ ...base, status: "failed", last_error: "x".repeat(600) })).toMatchObject({ status: "failed", error: "x".repeat(500) });
  });

  it("imports the dedupe key as a stable sha256, never as stored, and nob:<public_id> when there is none", () => {
    const withToken = "staff_invitation:a@x.ca:https://app.tiffingrab.ca/verify?token=secret" + "k".repeat(200) + ":email";
    const ref = mapMessage({ ...base, dedupe_key: withToken })!.importRef;
    expect(ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ref).not.toContain("token");
    expect(mapMessage({ ...base, dedupe_key: withToken })!.importRef).toBe(ref);
    expect(mapMessage(base)!.importRef).not.toBe(ref);
    expect(mapMessage({ ...base, dedupe_key: null })).toMatchObject({ importRef: "nob:nob_1" });
  });

  it("skips pending and processing rows (the engine still sends them)", () => {
    expect(mapMessage({ ...base, status: "pending" })).toBeNull();
    expect(mapMessage({ ...base, status: "processing" })).toBeNull();
  });

  it("marks marketing rows and falls back to the event name for the subject", () => {
    expect(mapMessage({ ...base, kind: "marketing", payload: {} })).toMatchObject({ stream: "marketing", subject: "order_created" });
  });
});
