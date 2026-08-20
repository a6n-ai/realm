import Link from "next/link";
import { Button } from "@realm/ui/button";

export function DabbaMath({ eyebrow, cta = "See my price →" }: { eyebrow?: string; cta?: string }) {
  return (
    <>
      {eyebrow ? <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">{eyebrow}</p> : null}
      <h2 className="m-0 mb-6.5 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">No packages. Just math.</h2>
      <div className="flex flex-wrap items-center gap-3.5 text-[clamp(16px,2.6vw,26px)] font-bold">
        <span className="bg-card rounded-full border px-6 py-3.5">per-tiffin rate</span>
        <span className="text-primary text-[clamp(22px,3vw,34px)]">×</span>
        <span className="bg-card rounded-full border px-6 py-3.5">days/week</span>
        <span className="text-primary text-[clamp(22px,3vw,34px)]">×</span>
        <span className="bg-card rounded-full border px-6 py-3.5">weeks</span>
        <span className="text-primary text-[clamp(22px,3vw,34px)]">×</span>
        <span className="bg-card rounded-full border px-6 py-3.5">persons</span>
        <span className="text-primary text-[clamp(22px,3vw,34px)]">=</span>
        <span className="bg-primary text-primary-foreground rounded-full px-6.5 py-3.5 shadow-[0_10px_26px_rgba(240,107,26,0.3)]">
          your total
        </span>
      </div>
      <div className="text-muted-foreground mt-6.5 flex flex-wrap gap-6.5 text-sm leading-relaxed">
        <p className="m-0 max-w-65"><strong className="text-[#1D5C32]">20+ tiffins</strong> unlocks the best per-tiffin rate.</p>
        <p className="m-0 max-w-65"><strong className="text-[#1D5C32]">Longer commitments</strong> earn up to −12%.</p>
        <p className="m-0 max-w-65"><strong className="text-[#1D5C32]">Weekends optional</strong> — billed per tiffin, same as weekdays.</p>
      </div>
      <Button asChild size="lg" className="mt-8.5 rounded-full"><Link href="/subscribe">{cta}</Link></Button>
    </>
  );
}
