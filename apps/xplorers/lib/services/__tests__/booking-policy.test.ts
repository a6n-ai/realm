import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { assertCanBook, remainingSeats } from "../booking-policy";

const future = new Date("2026-10-01T10:00:00.000Z");
const now = new Date("2026-09-16T10:00:00.000Z");

function bookable(over: Partial<Parameters<typeof assertCanBook>[0]> = {}) {
  return {
    published: true,
    archived: false,
    startsAt: future,
    now,
    remaining: 4,
    seats: 1,
    ...over,
  };
}

describe("remainingSeats", () => {
  it("subtracts confirmed seats from capacity", () => {
    expect(remainingSeats(10, 6)).toBe(4);
  });

  it("does not go negative", () => {
    expect(remainingSeats(2, 5)).toBe(0);
  });
});

describe("assertCanBook", () => {
  it("allows a published future session with remaining seats", () => {
    expect(() => assertCanBook(bookable())).not.toThrow();
  });

  it("rejects an unpublished session", () => {
    expect(() => assertCanBook(bookable({ published: false }))).toThrow(ValidationError);
    expect(() => assertCanBook(bookable({ published: false }))).toThrow(/not open/);
  });

  it("rejects a past session", () => {
    expect(() => assertCanBook(bookable({ startsAt: new Date("2026-09-01T10:00:00.000Z") }))).toThrow(/already started/);
  });

  it("rejects when remaining capacity is below requested seats", () => {
    expect(() => assertCanBook(bookable({ remaining: 1, seats: 2 }))).toThrow(/Only 1 seat left/);
  });

  it("rejects the last-seat oversell", () => {
    expect(() => assertCanBook(bookable({ remaining: 0, seats: 1 }))).toThrow(/full/);
  });

  it("rejects archived sessions", () => {
    expect(() => assertCanBook(bookable({ archived: true }))).toThrow(/no longer offered/);
  });
});

