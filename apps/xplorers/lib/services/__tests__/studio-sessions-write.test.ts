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
        capacity: 8,
      }),
    ).toThrow(/category/);
    expect(() =>
      normalizeClassWrite({
        title: "Kids Club",
        category: "kids",
        capacity: 0,
      }),
    ).toThrow(/Capacity/);
  });

  it("writes the summary and leaves the rest of the class untouched", () => {
    const record = normalizeClassWrite({ title: "Kids Club", category: "kids", description: " Hi ", capacity: 8 });
    expect(record.published).toBe(false);
    expect(record.summary).toBe("Hi");
    expect(record.photos).toEqual([]);
    expect(record).not.toHaveProperty("pricing");
  });

  it("keeps uploaded photos", () => {
    expect(
      normalizeClassWrite(
        {
          title: "Kids Club",
          category: "kids",
          capacity: 8,
          photos: ["/api/files/public/classes/kite.png"],
        },
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
