import { describe, expect, it } from "vitest";
import { buildMetaCapiBody, META_GRAPH_API_VERSION } from "../capi";
import { buildMetaUserData } from "../user-data";
import { fbcFromFbclid } from "../request-context";

describe("meta capi", () => {
  it("uses Graph API v26.0", () => {
    expect(META_GRAPH_API_VERSION).toBe("v26.0");
  });

  it("returns null body without an event id", () => {
    expect(
      buildMetaCapiBody({
        eventName: "ViewContent",
        eventId: "   ",
        userData: { email: "a@b.com" },
      }),
    ).toBeNull();
  });

  it("builds event payload with hashed user_data and the Settings test code", () => {
    const body = buildMetaCapiBody({
      eventName: "Purchase",
      eventId: "pay_abc",
      eventSourceUrl: "https://app.tiffingrab.ca/checkout",
      eventTime: 1_700_000_000,
      userData: {
        email: "Ada@Example.COM",
        phone: "4165551234",
        fullName: "Ada Lovelace",
        city: "Toronto",
        province: "ON",
        postalCode: "M5V 3L9",
        country: "ca",
        externalId: "usr_1",
        clientIpAddress: "1.2.3.4",
        clientUserAgent: "TestAgent",
        fbp: "fb.1.1.1",
        fbc: "fb.1.1.clid",
      },
      customData: { value: 99.5, currency: "CAD", content_ids: ["veg"], num_items: 10 },
    }, "TEST123");

    expect(body).toMatchObject({
      test_event_code: "TEST123",
      data: [
        {
          event_name: "Purchase",
          event_time: 1_700_000_000,
          event_id: "pay_abc",
          action_source: "website",
          event_source_url: "https://app.tiffingrab.ca/checkout",
          custom_data: { value: 99.5, currency: "CAD", content_ids: ["veg"], num_items: 10 },
        },
      ],
    });

    const ud = (body!.data as { user_data: Record<string, unknown> }[])[0]!.user_data;
    expect(ud.em).toEqual(["b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72"]);
    expect(ud.client_ip_address).toBe("1.2.3.4");
    expect(ud.client_user_agent).toBe("TestAgent");
    expect(ud.fbp).toBe("fb.1.1.1");
    expect(ud.fbc).toBe("fb.1.1.clid");
    expect(Object.keys(ud).every((k) => k.length > 0)).toBe(true);
  });

  it("omits empty hashed fields", () => {
    expect(buildMetaUserData({ email: "  ", phone: null, fullName: "" })).toEqual({});
  });

  it("builds fbc from fbclid", () => {
    expect(fbcFromFbclid("https://x.com/?fbclid=AbC", 1_700_000_000_000)).toBe("fb.1.1700000000000.AbC");
    expect(fbcFromFbclid("https://x.com/")).toBeUndefined();
  });
});
