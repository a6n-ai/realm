import { describe, expect, test } from "vitest";
import type { Activity } from "../../../lib/inquiries/queries";
import { describeActivity } from "../labels";

const act = (o: Partial<Activity>): Activity => ({
  id: "a", createdAt: 0, type: "reassigned", note: null, fromStage: null, toStage: null,
  fromOwnerName: null, toOwnerName: null, actorName: null, ...o,
});

describe("describeActivity reassigned", () => {
  test("removal reads as reassigned from the removed member", () => {
    expect(describeActivity(act({ fromOwnerName: "Sam Sales", actorName: "Ada" }))).toBe("Reassigned from Sam Sales (removed)");
  });
  test("claim and assign copy unchanged", () => {
    expect(describeActivity(act({ toOwnerName: "Ada", actorName: "Ada" }))).toBe("Claimed by Ada");
    expect(describeActivity(act({ fromOwnerName: "Sam", toOwnerName: "Bo", actorName: "Ada" }))).toBe("Assigned to Bo (was Sam)");
  });
});
