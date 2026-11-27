import { describe, expect, it } from "vitest";
import { toRelayReason } from "./blocks";

describe("toRelayReason", () => {
  it.each([
    ["SES hard bounce", "bounce"],
    ["SES complaint", "complaint"],
    ["sms STOP keyword", "unsubscribe"],
    ["manual", "manual"],
    ["weird", "manual"],
  ])("maps %s to %s", (reason, expected) => {
    expect(toRelayReason(reason)).toBe(expected);
  });
});
