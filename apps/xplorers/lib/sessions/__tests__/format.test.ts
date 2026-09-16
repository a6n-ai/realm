import { describe, expect, it } from "vitest";
import { formatSessionDay, formatTapeDay, groupSessionsByDay, toPublicSessionCard } from "../format";
import type { PublicSession } from "@/lib/services/studio-sessions.service";

const zone = "Asia/Singapore";

function session(over: Partial<PublicSession> & Pick<PublicSession, "startsAt" | "title">): PublicSession {
  return {
    id: 1n,
    publicId: over.publicId ?? "stn_test",
    appId: 1n,
    createdAt: 0,
    createdBy: null,
    updatedAt: 0,
    updatedBy: null,
    category: "kids",
    description: null,
    endsAt: new Date(over.startsAt.getTime() + 90 * 60 * 1000),
    audience: "Age 6+",
    capacity: 8,
    priceDisplay: "$35",
    location: "Bench 01",
    attendanceMode: "drop_off",
    published: true,
    archived: false,
    remaining: 4,
    ...over,
  };
}

describe("session display", () => {
  it("formats the board day from the session start in the app timezone", () => {
    const startsAt = new Date("2026-09-16T02:00:00.000Z");
    expect(formatSessionDay(startsAt, zone)).toBe("Wed 16 Sept");
    expect(formatTapeDay(startsAt, zone, new Date("2026-09-16T01:00:00.000Z"))).toBe("Today · Wed 16 Sept");
  });

  it("groups published sessions by local day", () => {
    const cards = [
      toPublicSessionCard(session({ title: "Kids Club", startsAt: new Date("2026-09-16T08:00:00.000Z") }), zone),
      toPublicSessionCard(session({ title: "Crafting Club", startsAt: new Date("2026-09-16T11:00:00.000Z"), category: "adults" }), zone),
      toPublicSessionCard(session({ title: "Saturday lab", startsAt: new Date("2026-09-17T02:00:00.000Z") }), zone),
    ];
    const groups = groupSessionsByDay(cards, zone, new Date("2026-09-16T01:00:00.000Z"));
    expect(groups).toHaveLength(2);
    expect(groups[0]?.tape).toMatch(/^Today/);
    expect(groups[0]?.rows.map((row) => row.title)).toEqual(["Kids Club", "Crafting Club"]);
    expect(groups[1]?.label).toBe("Thu 17 Sept");
  });
});
