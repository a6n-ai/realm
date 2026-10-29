import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { assertCanBook, bestRemaining, remainingSeats, seatsDuring } from "../booking-policy";

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00+08:00`);

describe("per-slot capacity", () => {
  const nine = { startsAt: at("09:00"), endsAt: at("10:30"), seats: 1 };

  it("counts only bookings that overlap the slot", () => {
    expect(seatsDuring([nine], at("09:00"), at("10:30"))).toBe(1);
    expect(seatsDuring([nine], at("10:30"), at("12:00"))).toBe(0);
    expect(seatsDuring([nine], at("10:00"), at("11:30"))).toBe(1);
  });

  it("a capacity-1 day stays open while another slot is free", () => {
    expect(bestRemaining(1, at("09:00"), at("20:30"), [nine])).toBe(1);
    expect(bestRemaining(1, at("09:00"), at("10:30"), [nine])).toBe(0);
    expect(bestRemaining(6, at("09:00"), at("10:30"), [])).toBe(6);
  });
});

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
    expect(() => assertCanBook(bookable({ remaining: 1, seats: 2 }))).toThrow(/Only 1 place left/);
  });

  it("rejects the last-seat oversell", () => {
    expect(() => assertCanBook(bookable({ remaining: 0, seats: 1 }))).toThrow(/full/);
  });

  it("rejects archived sessions", () => {
    expect(() => assertCanBook(bookable({ archived: true }))).toThrow(/no longer offered/);
  });
});

