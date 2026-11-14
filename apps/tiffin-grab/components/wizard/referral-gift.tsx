import { GiftIcon } from "lucide-react";

/** The referred friend's reward, shown on the way to paying so a share-link gift never looks lost.
 *  It is wallet coins credited after the first paid plan, so the copy says exactly that. */
export function ReferralGift({ from, figure }: { from: string | null; figure: string }) {
  return (
    <p role="status" className="c-surface flex items-start gap-3 rounded-2xl bg-[var(--primary-wash)] px-4 py-3 text-sm">
      <GiftIcon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">{from ? `Gift from ${from}: ${figure}` : `Your friend's gift: ${figure}`}</span>
        <span className="text-muted-foreground"> lands in your wallet once your first plan is paid.</span>
      </span>
    </p>
  );
}
