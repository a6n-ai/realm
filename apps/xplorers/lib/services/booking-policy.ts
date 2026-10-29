import { ValidationError } from "@foundry/commons";

export const RESERVED_BOOKING_STATUSES = ["pending", "confirmed"] as const;

export function remainingSeats(capacity: number, reservedSeats: number): number {
  return Math.max(0, capacity - reservedSeats);
}

export type Reserved = { startsAt: Date; endsAt: Date; seats: number };

const SLOT_MS = 30 * 60_000;

/**
 * Seats held by bookings that overlap [start, end). Capacity means children in the room at once,
 * so a 9:00 private booking does not fill the 13:00 slot on the same day.
 * ponytail: sums every overlap, an upper bound on the true peak; fine while slots do not stagger.
 */
export function seatsDuring(reserved: Reserved[], start: Date, end: Date): number {
  return reserved
    .filter((r) => r.startsAt.getTime() < end.getTime() && r.endsAt.getTime() > start.getTime())
    .reduce((n, r) => n + r.seats, 0);
}

/** Places left at the quietest half hour of the window: what a listing can still promise. */
export function bestRemaining(capacity: number, windowStart: Date, windowEnd: Date, reserved: Reserved[]): number {
  if (reserved.length === 0) return capacity;
  let best = 0;
  for (let t = windowStart.getTime(); t < windowEnd.getTime(); t += SLOT_MS) {
    const end = Math.min(t + SLOT_MS, windowEnd.getTime());
    best = Math.max(best, remainingSeats(capacity, seatsDuring(reserved, new Date(t), new Date(end))));
  }
  return best;
}

export function isPubliclyListed(
  session: { published: boolean; archived: boolean; startsAt: Date },
  now: Date,
): boolean {
  return session.published && !session.archived && session.startsAt.getTime() > now.getTime();
}

export function assertCanBook(input: {
  published: boolean;
  archived: boolean;
  startsAt: Date;
  now: Date;
  remaining: number;
  seats: number;
}): void {
  if (!Number.isInteger(input.seats) || input.seats < 1) {
    throw new ValidationError("Book at least one place.");
  }
  if (!input.published) {
    throw new ValidationError("This session is not open for booking.");
  }
  if (input.archived) {
    throw new ValidationError("This session is no longer offered.");
  }
  if (input.startsAt.getTime() <= input.now.getTime()) {
    throw new ValidationError("This session has already started.");
  }
  if (input.remaining < input.seats) {
    throw new ValidationError(
      input.remaining === 0 ? "This session is full." : `Only ${input.remaining} place${input.remaining === 1 ? "" : "s"} left.`,
    );
  }
}
