export type ReviewNudgeState = {
  /** When the review-request email was sent. */
  sentAt: Date | null;
  /** When the customer clicked through or dismissed. Suppresses both channels. */
  doneAt: Date | null;
};

/** App-injected persistence, keyed by customer email. */
export type ReviewNudgeStore = {
  get(email: string): Promise<ReviewNudgeState | undefined>;
  markSent(email: string): Promise<void>;
  markDone(email: string): Promise<void>;
};

/** Once per customer, forever: either channel having fired closes it out. */
export function shouldNudge(state: ReviewNudgeState | undefined): boolean {
  if (!state) return true;
  return state.sentAt === null && state.doneAt === null;
}

export function writeReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
