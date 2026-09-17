import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { assertCanBook, isPubliclyListed, remainingSeats } from "../booking-policy";
import { normalizeSessionWrite } from "../studio-sessions.service";

const future = new Date("2026-10-01T10:00:00.000Z");
const now = new Date("2026-09-16T10:00:00.000Z");

describe("isPubliclyListed", () => {
  it("lists a published upcoming session", () => {
    expect(isPubliclyListed({ published: true, archived: false, startsAt: future }, now)).toBe(true);
  });

  it("hides unpublished, archived, and past sessions", () => {
    expect(isPubliclyListed({ published: false, archived: false, startsAt: future }, now)).toBe(false);
    expect(isPubliclyListed({ published: true, archived: true, startsAt: future }, now)).toBe(false);
    expect(isPubliclyListed({ published: true, archived: false, startsAt: new Date("2026-09-01T10:00:00.000Z") }, now)).toBe(
      false,
    );
  });
});

describe("normalizeSessionWrite", () => {
  it("requires a category and a positive capacity", () => {
    expect(() =>
      normalizeSessionWrite({
        title: "Kids Club",
        startsAt: future,
        endsAt: new Date("2026-10-01T12:00:00.000Z"),
        capacity: 8,
      }),
    ).toThrow(/category/);
    expect(() =>
      normalizeSessionWrite({
        title: "Kids Club",
        category: "kids",
        startsAt: future,
        endsAt: new Date("2026-10-01T12:00:00.000Z"),
        capacity: 0,
      }),
    ).toThrow(/Capacity/);
  });

  it("keeps published off unless explicitly set", () => {
    const { record, dates } = normalizeSessionWrite(
      {
        title: "Kids Club",
        category: "kids",
        startsAt: future,
        endsAt: new Date("2026-10-01T12:00:00.000Z"),
        capacity: 8,
      },
      "UTC",
    );
    expect(record.published).toBe(false);
    expect(record.weekdays).toEqual([]);
    expect(dates).toEqual(["2026-10-01"]);
  });

  it("rejects a class that spans two days and stores extra dates", () => {
    expect(() =>
      normalizeSessionWrite(
        {
          title: "Kids Club",
          category: "kids",
          startsAt: new Date("2026-09-22T08:00:00.000Z"),
          endsAt: new Date("2026-09-23T09:30:00.000Z"),
          capacity: 8,
        },
        "Asia/Singapore",
      ),
    ).toThrow(/one day/);

    const { dates } = normalizeSessionWrite(
      {
        title: "Kids Club",
        category: "kids",
        startsAt: new Date("2026-09-22T08:00:00.000Z"),
        endsAt: new Date("2026-09-22T09:30:00.000Z"),
        capacity: 8,
        alsoOn: ["2026-09-24"],
      },
      "Asia/Singapore",
    );
    expect(dates).toEqual(["2026-09-22", "2026-09-24"]);
  });
});

describe("concurrent last-seat books", () => {
  it("confirms the first seat and rejects the second once remaining is 0", () => {
    const capacity = 1;
    let confirmed = 0;
    const bookable = (remaining: number) => ({
      published: true,
      archived: false,
      startsAt: future,
      now,
      remaining,
      seats: 1,
    });

    const firstRemaining = remainingSeats(capacity, confirmed);
    expect(() => assertCanBook(bookable(firstRemaining))).not.toThrow();
    confirmed += 1;

    const secondRemaining = remainingSeats(capacity, confirmed);
    expect(secondRemaining).toBe(0);
    expect(() => assertCanBook(bookable(secondRemaining))).toThrow(ValidationError);
    expect(() => assertCanBook(bookable(secondRemaining))).toThrow(/full/);
  });
});
