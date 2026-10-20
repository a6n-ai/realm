import { describe, expect, it } from "vitest";
import {
  formatScheduleLabel,
  formatSessionDay,
  formatTapeDay,
  groupPublicClasses,
  groupSessionsByDay,
  toPublicSessionCard,
} from "../format";
import { DEFAULT_PRICE_TABLE } from "@/lib/pricing/defaults";
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
    summary: "",
    endsAt: new Date(over.startsAt.getTime() + 90 * 60 * 1000),
    ageMin: 6,
    ageMax: null,
    ageWaiver: false,
    included: null,
    scheduleLine: null,
    groupSize: null,
    bookingType: "bookable",
    color: "pink",
    pricing: { mode: "length", defaultLengthMinutes: 60, options: [], extension: null, adults: { free: 0, extraPrice: null } },
    prices: { "len:60": { weekday: 35 } },
    pattern: null,
    sortOrder: 0,
    capacity: 8,
    location: "Bench 01",
    attendanceMode: "drop_off",
    published: true,
    archived: false,
    remaining: 4,
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
  it("lists every published class once, in the order given, with its upcoming dates", () => {
    const kite = session({ publicId: "stn_kite", title: "Kite Lab", startsAt: new Date("2026-09-18T08:00:00.000Z"), photos: ["/k.jpg"] });
    const club = session({ publicId: "stn_club", title: "Kids Club", startsAt: new Date("2026-09-16T08:00:00.000Z") });
    const quiet = session({ publicId: "stn_quiet", title: "Quiet Corner", startsAt: new Date("2026-09-20T08:00:00.000Z") });
    const occurrences = [
      club,
      { ...kite, occurrencePublicId: "occ_k1" },
      { ...kite, occurrencePublicId: "occ_k2", startsAt: new Date("2026-09-25T08:00:00.000Z") },
    ];

    const classes = groupPublicClasses([quiet, kite, club], occurrences, zone, "SGD", DEFAULT_PRICE_TABLE);

    expect(classes.map((c) => c.publicId)).toEqual(["stn_quiet", "stn_kite", "stn_club"]);
    expect(classes[1]).toMatchObject({
      title: "Kite Lab",
      photos: ["/k.jpg"],
      priceLine: "From S$35 / child",
      nextDate: "Fri 18 Sept",
    });
    expect(classes[1]?.sessions.map((s) => s.publicId)).toEqual(["occ_k1", "occ_k2"]);
    expect(classes[1]?.sessions[0]?.time).toMatch(/^Fri 18 Sept · /);
    expect(classes[0]).toMatchObject({ nextDate: null, sessions: [] });
  });
});

describe("groupPublicClasses price", () => {
  it("derives the price line, and asks to enquire for enquire-only classes", () => {
    const paid = session({ publicId: "stn_paid", title: "Paid", startsAt: new Date(), prices: { "len:60": { weekday: 25, weekend: 30 } } });
    const camp = session({ publicId: "stn_camp", title: "Camp", startsAt: new Date(), bookingType: "enquire_only" });
    const [camped] = groupPublicClasses([camp], [], zone, "SGD", DEFAULT_PRICE_TABLE);
    expect(camped?.priceLine).toBe("Enquire for dates & pricing");
    const [c] = groupPublicClasses([paid], [], zone, "SGD", DEFAULT_PRICE_TABLE);
    expect(c?.priceLine).toBe("From S$25 / child");
  });
});
