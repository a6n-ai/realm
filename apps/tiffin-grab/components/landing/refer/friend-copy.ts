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
