import { describe, expect, test } from "vitest";
import type { Activity } from "../../../lib/inquiries/queries";
import { describeActivity, isSystemActivity, systemLine } from "../labels";

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

describe("systemLine", () => {
  test("stage changes read as a compact line with the actor in front", () => {
    expect(systemLine(act({ type: "stage_change", fromStage: "new", toStage: "contacted", actorName: "V" }))).toBe("V moved New → Contacted");
  });
  test("claims and assignments name the actor", () => {
    expect(systemLine(act({ toOwnerName: "Ada", actorName: "Ada" }))).toBe("Ada claimed it");
    expect(systemLine(act({ toOwnerName: "Bo", fromOwnerName: "Sam", actorName: "Ada" }))).toBe("Ada assigned it to Bo");
  });
  test("only notes, calls, WhatsApp and email are human entries", () => {
    expect(isSystemActivity({ type: "call" })).toBe(false);
    expect(isSystemActivity({ type: "stage_change" })).toBe(true);
  });
});

describe("meeting doc activity", () => {
  test("doc activity lines", () => {
    const lines = [
      act({ type: "doc_joined", note: "Ana", actorName: null }),
      act({ type: "doc_edited", actorName: null, note: "Ana" }),
      act({ type: "doc_started", actorName: "Sam" }),
    ];
    expect(lines.map(systemLine)).toEqual(["Client joined: Ana", "Doc edited by Ana", "Sam started a meeting doc"]);
    expect(lines.every(isSystemActivity)).toBe(true);
  });
});
