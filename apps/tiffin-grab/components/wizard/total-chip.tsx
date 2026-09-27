/** Running total in the sticky top bar; opens the price summary sheet. */
export function TotalChip({ tiffinCount, total, open, onOpen }: { tiffinCount: number; total: number; open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Price summary: ${tiffinCount} tiffins, $${total.toFixed(2)} total`}
      onClick={onOpen}
      className="bg-primary/15 text-foreground focus-visible:ring-ring flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition-transform duration-100 outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100"
    >
      <span className="text-muted-foreground">{tiffinCount}<span> {tiffinCount === 1 ? "tiffin" : "tiffins"}</span></span>
      <span className="min-w-[4.5ch] text-right text-[15px]">${total.toFixed(2)}</span>
    </button>
  );
}
