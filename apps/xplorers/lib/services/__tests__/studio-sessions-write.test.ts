import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { assertCanBook, isPubliclyListed, remainingSeats } from "../booking-policy";
import { normalizeClassWrite } from "../studio-sessions.service";

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

describe("normalizeClassWrite", () => {
  it("requires a category and a positive capacity", () => {
    expect(() =>
      normalizeClassWrite({
        title: "Kids Club",
        startsAt: future,
        endsAt: new Date("2026-10-01T12:00:00.000Z"),
        capacity: 8,
      }),
    ).toThrow(/category/);
    expect(() =>
      normalizeClassWrite({
        title: "Kids Club",
        category: "kids",
        startsAt: future,
        endsAt: new Date("2026-10-01T12:00:00.000Z"),
        capacity: 0,
      }),
    ).toThrow(/Capacity/);
  });

  it("stores a clock without scheduling dates", () => {
    const record = normalizeClassWrite(
      {
        title: "Kids Club",
        category: "kids",
        startsAt: "16:00",
        endsAt: "17:30",
        capacity: 8,
      },
      "Asia/Singapore",
    );
    expect(record.published).toBe(false);
    expect(record.weekdays).toEqual([]);
    expect(record.photos).toEqual([]);
    expect(
      normalizeClassWrite(
        {
          title: "Kids Club",
          category: "kids",
          startsAt: "16:00",
          endsAt: "17:30",
          capacity: 8,
          priceAmount: "35.5",
        },
        "Asia/Singapore",
      ).priceAmount,
    ).toBe("35.50");
  });

  it("rejects a class clock that wraps past midnight", () => {
    expect(() =>
      normalizeClassWrite(
        {
          title: "Kids Club",
          category: "kids",
          startsAt: "23:00",
          endsAt: "01:00",
          capacity: 8,
        },
        "Asia/Singapore",
      ),
    ).toThrow(/after start/);
  });

  it("keeps uploaded photos", () => {
    expect(
      normalizeClassWrite(
        {
          title: "Kids Club",
          category: "kids",
          startsAt: new Date("2026-09-22T08:00:00.000Z"),
          endsAt: new Date("2026-09-22T09:30:00.000Z"),
          capacity: 8,
          photos: ["/api/files/public/classes/kite.png"],
        },
        "Asia/Singapore",
      ).photos,
    ).toEqual(["/api/files/public/classes/kite.png"]);
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
