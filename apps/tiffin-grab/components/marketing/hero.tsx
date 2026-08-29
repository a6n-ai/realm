import Image from "next/image";
import Link from "next/link";
import { Button } from "@realm/ui/button";

export function Hero() {
  return (
    <section className="relative flex min-h-[86vh] flex-col justify-center overflow-hidden px-4 pt-28 pb-16 sm:px-8 md:px-12">
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="https://commons.wikimedia.org/wiki/Special:FilePath/Traditional%20North%20Indian%20Thali.jpg?width=1600"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_10%,color-mix(in_srgb,var(--background)_74%,transparent)_48%,color-mix(in_srgb,var(--background)_28%,transparent)_78%,transparent_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[linear-gradient(transparent,var(--background))]" />
        <div className="absolute inset-x-0 top-0 h-[110px] bg-[linear-gradient(var(--background),transparent)]" />
      </div>
      <a
        href="https://commons.wikimedia.org/wiki/File:Traditional_North_Indian_Thali.jpg"
        target="_blank"
        rel="noreferrer"
        className="absolute right-2 bottom-2 z-[1] text-xs text-muted-foreground/70 hover:text-muted-foreground"
      >
        Photo: Wikimedia Commons, CC BY-SA 4.0
      </a>
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
          <Button asChild size="lg" className="hover-lift h-[60px] rounded-full px-9 text-lg font-semibold shadow-[0_12px_30px_-6px_var(--color-primary)]">
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
  "Fresh daily ✦ Home-style ✦ 11 GTA regions ✦ You pick the dishes ✦ From $9.99 a tiffin ✦ Mon–Fri delivery ✦ ";
