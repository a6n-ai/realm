/** Running total in the sticky top bar; opens the price summary sheet. One line at every width: count badge, then total. */
export function TotalChip({ tiffinCount, total, open, onOpen }: { tiffinCount: number; total: number; open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Price summary: ${tiffinCount} tiffins, $${total.toFixed(2)} total`}
      onClick={onOpen}
      className="bg-primary/15 text-foreground focus-visible:ring-ring flex h-11 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-1.5 whitespace-nowrap tabular-nums transition-transform duration-100 outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100"
    >
      <span aria-hidden className="bg-primary text-primary-foreground grid h-8 min-w-8 place-items-center rounded-full px-1.5 text-[13px] font-bold">{tiffinCount}</span>
      <span aria-hidden className="text-[15px] font-semibold">${total.toFixed(2)}</span>
    </button>
  );
}
