import { describe, expect, it } from "vitest";
import { effectiveTrackStatus, isClosedTrack, trackLabel } from "../status";

describe("trackLabel", () => {
  it("labels New for null and title-cases the rest", () => {
    expect(trackLabel(null)).toBe("New");
    expect(trackLabel("pending_payment")).toBe("Pending Payment");
    expect(trackLabel("not_renewed")).toBe("Not renewed");
  });
});

describe("isClosedTrack", () => {
  it("closes only renewed and not_renewed", () => {
    expect(isClosedTrack("renewed") && isClosedTrack("not_renewed")).toBe(true);
    expect(isClosedTrack("follow_up")).toBe(false);
    expect(isClosedTrack(null)).toBe(false);
  });
});

describe("effectiveTrackStatus", () => {
  it("auto renewed beats a staff status set before the later booking", () => {
    expect(effectiveTrackStatus({ staff: "follow_up", staffSetAt: 100, computed: "renewed", laterBookedAt: 200 }))
      .toEqual({ status: "renewed", source: "auto" });
  });

  it("staff status wins when it was set after the later booking", () => {
    expect(effectiveTrackStatus({ staff: "follow_up", staffSetAt: 100, computed: "renewed", laterBookedAt: 50 }))
      .toEqual({ status: "follow_up", source: "staff" });
  });

  it("staff status stands when nothing computed", () => {
    expect(effectiveTrackStatus({ staff: "expected", staffSetAt: 100, computed: "none", laterBookedAt: null }))
      .toEqual({ status: "expected", source: "staff" });
  });

  it("waitlisted maps to pending_payment automatically", () => {
    expect(effectiveTrackStatus({ staff: null, staffSetAt: null, computed: "waitlisted", laterBookedAt: 10 }))
      .toEqual({ status: "pending_payment", source: "auto" });
  });

  it("returns nothing when no staff status and no computed status", () => {
    expect(effectiveTrackStatus({ staff: null, staffSetAt: null, computed: "none", laterBookedAt: null }))
      .toEqual({ status: null, source: null });
    expect(effectiveTrackStatus({ staff: null, staffSetAt: null, computed: "none", laterBookedAt: 10 }))
      .toEqual({ status: null, source: null });
  });
});
