import { describe, expect, it } from "vitest";
import type { AdminOccurrence } from "@/lib/services/studio-sessions.service";
import { colorVar, toCalendarSessions } from "../calendar-events";

const row = (over: Partial<AdminOccurrence> = {}): AdminOccurrence => ({
  publicId: "occ1",
  classPublicId: "cls1",
  title: "Hip hop",
  category: "kids",
  occursOn: "2026-10-20",
  startsAt: new Date("2026-10-20T10:00:00Z"),
  endsAt: new Date("2026-10-20T11:00:00Z"),
  capacity: 8,
  remaining: 3,
  published: true,
  location: null,
  archived: false,
  color: "sky",
  status: "scheduled",
  ...over,
});

describe("toCalendarSessions", () => {
  it("maps rows to ISO strings and keeps seats", () => {
    expect(toCalendarSessions([row()])).toEqual([
      {
        publicId: "occ1",
        classPublicId: "cls1",
        title: "Hip hop",
        color: "sky",
        startsAt: "2026-10-20T10:00:00.000Z",
        endsAt: "2026-10-20T11:00:00.000Z",
        remaining: 3,
        capacity: 8,
        cancelled: false,
      },
    ]);
  });

  it("suffixes cancelled sessions", () => {
    const [s] = toCalendarSessions([row({ status: "cancelled" })]);
    expect(s?.title).toBe("Hip hop (Cancelled)");
    expect(s?.cancelled).toBe(true);
  });
});

describe("colorVar", () => {
  it("maps class colours to palette hex and falls back to primary", () => {
    expect(colorVar("pink")).toBe("#ec4899");
    expect(colorVar("nope")).toBe("var(--color-primary)");
  });
});
