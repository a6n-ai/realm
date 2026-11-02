import { describe, expect, it } from "vitest";
import { inquirySubStatus } from "@/db/schema/inquiries";
import { SUB_STATUSES } from "../status";

describe("inquiry_sub_status enum", () => {
  it("matches SUB_STATUSES", () => {
    expect(inquirySubStatus.enumValues).toEqual([...SUB_STATUSES]);
  });
});
