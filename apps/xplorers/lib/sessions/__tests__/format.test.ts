import { describe, expect, it } from "vitest";
import {
  formatScheduleLabel,
  formatSessionDay,
  formatTapeDay,
  groupPublicClasses,
  groupSessionsByDay,
  toPublicSessionCard,
} from "../format";
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
    priceAmount: "35.00",
    location: "Bench 01",
    attendanceMode: "drop_off",
    published: true,
    archived: false,
    remaining: 4,
    weekdays: [],
    repeatsUntil: null,
    photos: over.photos ?? [],
    occurrencePublicId: over.occurrencePublicId ?? over.publicId ?? "occ_test",
    occursOn: over.occursOn ?? "2026-09-16",
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

  it("labels a class clock without extra dates", () => {
    expect(formatScheduleLabel({ startsAt: new Date("2026-09-15T08:00:00.000Z") }, zone)).toBe("Tue 15 Sept · 4:00 pm");
  });
});

describe("groupPublicClasses", () => {
  it("lists every published class once, soonest first, with its upcoming dates", () => {
    const kite = session({ publicId: "stn_kite", title: "Kite Lab", startsAt: new Date("2026-09-18T08:00:00.000Z"), photos: ["/k.jpg"] });
    const club = session({ publicId: "stn_club", title: "Kids Club", startsAt: new Date("2026-09-16T08:00:00.000Z") });
    const quiet = session({ publicId: "stn_quiet", title: "Quiet Corner", startsAt: new Date("2026-09-20T08:00:00.000Z") });
    const occurrences = [
      club,
      { ...kite, occurrencePublicId: "occ_k1" },
      { ...kite, occurrencePublicId: "occ_k2", startsAt: new Date("2026-09-25T08:00:00.000Z") },
    ];

    const classes = groupPublicClasses([quiet, kite, club], occurrences, zone, "SGD");

    expect(classes.map((c) => c.publicId)).toEqual(["stn_club", "stn_kite", "stn_quiet"]);
    expect(classes[1]).toMatchObject({
      title: "Kite Lab",
      photos: ["/k.jpg"],
      price: "$35",
      nextDate: "Fri 18 Sept",
    });
    expect(classes[1]?.sessions.map((s) => s.publicId)).toEqual(["occ_k1", "occ_k2"]);
    expect(classes[1]?.sessions[0]?.time).toMatch(/^Fri 18 Sept · /);
    expect(classes[2]).toMatchObject({ nextDate: null, sessions: [] });
  });
});

describe("groupPublicClasses price", () => {
  it("falls back to the amount, or Free, when there is no price text", () => {
    const paid = session({ publicId: "stn_paid", title: "Paid", startsAt: new Date(), priceDisplay: null, priceAmount: "25.00" });
    const free = session({ publicId: "stn_free", title: "Free", startsAt: new Date(), priceDisplay: null, priceAmount: "0.00" });
    const [a, b] = groupPublicClasses([free, paid], [], zone, "SGD");
    expect(a?.price).toBe("Free");
    expect(b?.price).toMatch(/25\.00/);
  });
});
