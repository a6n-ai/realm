import { describe, expect, it } from "vitest";

import { computeOverdue } from "../inquiries.service";

describe("computeOverdue", () => {
  const now = 1_000_000;

  it("is false when nextFollowUpAt is null", () => {
    expect(computeOverdue("contacted", null, now)).toBe(false);
  });

  it("is true when a past follow-up exists and the inquiry is still open", () => {
    expect(computeOverdue("contacted", now - 1, now)).toBe(true);
  });

  it("is false when the follow-up is in the future", () => {
    expect(computeOverdue("contacted", now + 1, now)).toBe(false);
  });

  it("is false for a converted inquiry even with a past follow-up", () => {
    expect(computeOverdue("converted", now - 1, now)).toBe(false);
  });

  it("is false for a lost inquiry even with a past follow-up", () => {
    expect(computeOverdue("lost", now - 1, now)).toBe(false);
  });
});
