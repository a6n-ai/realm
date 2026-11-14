/** Closing line of a donut or list card, shared so the cards end alike. */
export function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 flex items-center justify-between gap-2 border-t pt-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-semibold tabular-nums">{value}</span>
    </div>
  );
}
