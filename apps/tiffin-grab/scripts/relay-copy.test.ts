import { describe, expect, it } from "vitest";
import { mapCampaign, mapCampaignStatus, mapMember, mapMessage, mapReason, mapSuppression, mapTemplate, splitName } from "./relay-copy";

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
    expect(mapMember({ email: null, name: "Ana" })).toBeNull();
  });

  it("lowercases the email and splits the name", () => {
    expect(mapMember({ email: "Ana@X.ca", name: "Ana Lopez" })).toEqual({ email: "ana@x.ca", firstName: "Ana", lastName: "Lopez" });
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
  it("names the template by event and locale and puts the old body into intro", () => {
    const out = mapTemplate({ public_id: "ntp_1", event: "order_created", locale: "en", subject: "Hi\r\nthere", body: "Lead", html: "<p>h</p>", text: "t", enabled: true });
    expect(out).toMatchObject({ importRef: "ntp_1", name: "order_created:en", subject: "Hi there", intro: "Lead", enabled: true });
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
    expect(mapMessage(base)).toMatchObject({ importRef: "cmp:cmp_1:week:2099-01-05:42:email", toEmail: "ana@x.ca", stream: "transactional", subject: "Your order", status: "sent", deliveredAt: 1700000001000 });
    expect(mapMessage({ ...base, status: "failed", last_error: "x".repeat(600) })).toMatchObject({ status: "failed", error: "x".repeat(500) });
  });

  it("imports the engine's dedupe key as stored, and nob:<public_id> when there is none", () => {
    expect(mapMessage(base)).toMatchObject({ importRef: "cmp:cmp_1:week:2099-01-05:42:email" });
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
