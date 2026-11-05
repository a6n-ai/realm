import { describe, expect, it } from "vitest";
import { inquiriesListHref, parseInquiryBucket } from "../inquiries-drill";

describe("inquiries drill", () => {
  it("keeps the date range and names the KPI bucket", () => {
    expect(inquiriesListHref({ from: "10", to: "20" }, "follow_up")).toBe(
      "/dashboard/inquiries?from=10&to=20&bucket=follow_up",
    );
    expect(inquiriesListHref({}, "all")).toBe("/dashboard/inquiries?bucket=all");
    expect(inquiriesListHref({})).toBe("/dashboard/inquiries");
  });

  it("accepts only the four card buckets plus their union", () => {
    expect(parseInquiryBucket("lost")).toBe("lost");
    expect(parseInquiryBucket("due")).toBeNull();
    expect(parseInquiryBucket(undefined)).toBeNull();
  });
});
