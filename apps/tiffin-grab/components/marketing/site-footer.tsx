import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";

const ZONES = "Etobicoke · Mississauga · Brampton · Toronto · Scarborough · Markham · Richmond Hill · North York · Vaughan · Oakville & East York";

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background mx-2 rounded-t-3xl sm:mx-4">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" aria-label="TiffinGrab home" className="flex items-center gap-2">
            <BrandMark className="size-10" />
            <BrandWordmark className="text-xl" grabClassName="text-background" />
          </Link>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <Button asChild size="sm" className="rounded-full"><Link href="/subscribe">Start a plan →</Link></Button>
            <Link href="/faq" className="text-background/70 hover:text-background">FAQ</Link>
            <Link href="/contact" className="text-background/70 hover:text-background">Contact</Link>
          </div>
        </div>
        <p className="text-background/70 mt-6 max-w-md text-sm leading-relaxed">
          Customizable home-style tiffin delivery across {ZONES}.
        </p>
      </div>
      <div className="border-background/15 text-background/60 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t px-4 py-4 text-xs">
        <span>© 2026 Tiffin Grab. All rights reserved.</span>
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/terms" className="hover:text-background">Terms</Link>
          <Link href="/privacy" className="hover:text-background">Privacy</Link>
          <Link href="/refund-policy" className="hover:text-background">Refunds</Link>
          <Link href="/delivery-policy" className="hover:text-background">Delivery</Link>
        </nav>
      </div>
      <div className="overflow-hidden px-2 pb-2">
        <div className="text-primary translate-y-[14%] text-center text-[clamp(58px,12.5vw,180px)] leading-[0.9] font-bold tracking-[-0.05em] select-none">
          TIFFIN GRAB
        </div>
      </div>
    </footer>
  );
}
