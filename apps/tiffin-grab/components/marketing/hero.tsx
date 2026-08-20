import Link from "next/link";
import { Button } from "@realm/ui/button";

export function Hero() {
  return (
    <section className="relative flex min-h-[86vh] flex-col justify-center overflow-hidden px-4 pt-28 pb-16 sm:px-8 md:px-12">
      <div className="relative z-10 max-w-4xl">
        <p className="mb-1.5 text-xs font-semibold tracking-[0.25em] text-muted-foreground uppercase">
          Tiffin Grab · Greater Toronto Area
        </p>
        <h1 className="m-0 text-[clamp(48px,11vw,150px)] leading-[0.92] font-bold tracking-[-0.045em]">
          <span className="block text-transparent [-webkit-text-stroke:2px_var(--foreground)]">HOT.</span>
          <span className="block">HOME-STYLE.</span>
          <span className="block text-primary italic">DELIVERED.</span>
        </h1>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Button asChild size="lg" className="hover-lift h-[60px] rounded-full px-9 text-[17px] font-semibold shadow-[0_12px_30px_-6px_var(--color-primary)]">
            <Link href="/subscribe">Build my tiffin →</Link>
          </Button>
          <p className="m-0 max-w-[300px] text-sm leading-relaxed">
            Customizable tiffin subscriptions from <strong>$9.99</strong> a meal. You pick the dishes, we do the rest.
          </p>
        </div>
      </div>
      <div className="mt-14 overflow-hidden rounded-full bg-primary py-3.5 text-primary-foreground shadow-lg -rotate-1">
        <div className="flex w-max animate-[marquee_24s_linear_infinite] gap-11 text-sm font-bold tracking-[0.2em] whitespace-nowrap uppercase">
          <span>{TICKER}</span>
          <span>{TICKER}</span>
        </div>
      </div>
      <style>{`@keyframes marquee{to{transform:translateX(-50%)}}`}</style>
    </section>
  );
}

const TICKER =
  "Fresh daily ✦ Home-style ✦ 11 GTA regions ✦ You pick the dishes ✦ From $9.99 a tiffin ✦ Weekend delivery optional ✦ ";
