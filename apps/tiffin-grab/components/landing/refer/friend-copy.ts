/** "Priya gave you $15." A percent reward reads "5% back"; no first name on file reads "A friend". */
export function friendHeadline(firstName: string | null, friend: { big: string }): string {
  const gift = friend.big.endsWith("%") ? `${friend.big} back` : friend.big;
  return `${firstName ?? "A friend"} gave you ${gift}.`;
}
