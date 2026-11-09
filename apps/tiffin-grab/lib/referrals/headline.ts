import type { ReferralOffer } from "./offer";

/** "Give $15, get $15." with each side's own figure; one figure when only one side pays. */
export function referHeadline(offer: ReferralOffer): string {
  const { friend, referrer } = offer;
  if (friend && referrer) return `Give ${friend.big}, get ${referrer.big}.`;
  if (friend) return `Give your friends ${friend.big}.`;
  return `Get ${referrer!.big} for every friend.`;
}
