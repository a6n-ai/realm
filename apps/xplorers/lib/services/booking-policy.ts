import { ValidationError } from "@foundry/commons";

export function remainingSeats(capacity: number, confirmedSeats: number): number {
  return Math.max(0, capacity - confirmedSeats);
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
    throw new ValidationError("Book at least one seat.");
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
      input.remaining === 0 ? "This session is full." : `Only ${input.remaining} seat${input.remaining === 1 ? "" : "s"} left.`,
    );
  }
}
