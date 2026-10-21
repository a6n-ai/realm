/** Receipt rows in cents that always add up to the total: the subtotal is whatever tax and the card fee leave. */
export function receiptLines({ totalCents, taxCents, feeCents }: { totalCents: number; taxCents: number; feeCents: number }) {
  return [
    { label: "Subtotal", amount: totalCents - taxCents - feeCents },
    ...(taxCents > 0 ? [{ label: "Tax", amount: taxCents }] : []),
    ...(feeCents > 0 ? [{ label: "Card fee", amount: feeCents }] : []),
  ];
}
