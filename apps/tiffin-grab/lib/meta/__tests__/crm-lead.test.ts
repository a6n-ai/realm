import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMetaEvent = vi.fn();
vi.mock("../capi", () => ({
  sendMetaEvent: (args: unknown) => sendMetaEvent(args),
}));

const { sendMetaCrmLeadCreated, sendMetaCrmLeadStatus, sendMetaCrmQualifiedLead, META_CRM_QUALIFIED_EVENT } =
  await import("../crm-lead");

describe("crm lead CAPI", () => {
  beforeEach(() => {
    sendMetaEvent.mockClear();
  });

  it("no-ops without a Meta lead id", () => {
    sendMetaCrmQualifiedLead({
      publicId: "inq_1",
      metaLeadId: null,
      email: "a@b.com",
      phone: "+16475550100",
      fullName: "A",
    });
    expect(sendMetaEvent).not.toHaveBeenCalled();
  });

  it("sends CRM Lead on create with system_generated and lead_id", () => {
    sendMetaCrmLeadCreated({
      publicId: "inq_1",
      metaLeadId: "1234567890123456",
      email: "a@b.com",
      phone: "+16475550100",
      fullName: "Ada",
    });
    expect(sendMetaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Lead",
        eventId: "crm:inq_1:Lead",
        actionSource: "system_generated",
        userData: expect.objectContaining({ leadId: "1234567890123456" }),
        customData: { event_source: "crm", lead_event_source: "TiffinGrab" },
      }),
    );
  });

  it("maps status labels to CRM stage event names", () => {
    sendMetaCrmLeadStatus(
      {
        publicId: "inq_2",
        metaLeadId: "1234567890123456",
        email: null,
        phone: "+16475550101",
        fullName: null,
      },
      "pending_payment",
    );
    expect(sendMetaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Pending payment",
        eventId: "crm:inq_2:Pending_payment",
        actionSource: "system_generated",
      }),
    );
  });

  it("sends QualifiedLead on convert", () => {
    sendMetaCrmQualifiedLead({
      publicId: "inq_3",
      metaLeadId: "1234567890123457",
      email: "c@d.com",
      phone: "+16475550102",
      fullName: "Chen",
    });
    expect(sendMetaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: META_CRM_QUALIFIED_EVENT,
        eventId: `crm:inq_3:${META_CRM_QUALIFIED_EVENT}`,
      }),
    );
  });
});
