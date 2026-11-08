/** "Priya gave you $15." A percent reward reads "5% back"; no first name on file reads "A friend". */
export function friendHeadline(firstName: string | null, friend: { big: string }): string {
  const gift = friend.big.endsWith("%") ? `${friend.big} back` : friend.big;
  return `${firstName ?? "A friend"} gave you ${gift}.`;
}

/** How the gift arrives, worded for its kind: dollars and coins land as coins; a percent is of the first plan. */
export function friendGiftLine(friend: { big: string }): string {
  if (friend.big.endsWith("%")) return `${friend.big} of your first plan back in coins, once it's paid.`;
  const what = friend.big.startsWith("$") ? `${friend.big} in coins` : friend.big;
  return `${what}, added to your wallet after your first paid order.`;
}

/** "$6", or "5% back" for a percent reward, so a sentence never reads "you get 5%." */
export const rewardOf = (f: { big: string }) => (f.big.endsWith("%") ? `${f.big} back` : f.big);

export type TagFace = { label: string; big: string; small: string };

/** The hanging tag's faces: the friend's side on the front, yours on the back; one face when only one side pays. */
export function tagFaces({ friend, referrer }: { friend: { big: string; small: string } | null; referrer: { big: string; small: string } | null }): TagFace[] {
  return [
    friend ? { label: "For your friend", big: friend.big, small: friend.small.replace("your wallet", "their wallet") } : null,
    referrer ? { label: "For you", big: referrer.big, small: referrer.small } : null,
  ].filter((f): f is TagFace => f != null);
}
