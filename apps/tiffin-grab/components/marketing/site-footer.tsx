import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { UtensilsCrossedIcon } from "lucide-react";

const ZONES = "Etobicoke · Mississauga · Brampton · Toronto · Scarborough · Markham · Richmond Hill · North York · Vaughan · Oakville & East York";

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background mx-2 rounded-t-3xl sm:mx-4">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full">
            <UtensilsCrossedIcon className="size-5" />
          </span>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <Button asChild size="sm" className="rounded-full"><Link href="/subscribe">Start a plan →</Link></Button>
            <Link href="/contact" className="text-background/70 hover:text-background">Contact</Link>
          </div>
        </div>
        <p className="text-background/70 mt-6 max-w-md text-sm leading-relaxed">
          Customizable home-style tiffin delivery across {ZONES}.
        </p>
      </div>
      <div className="border-background/15 text-background/60 border-t py-4 text-center text-xs">
        © 2026 Tiffin Grab. All rights reserved.
      </div>
      <div className="overflow-hidden px-2 pb-2">
        <div className="text-primary translate-y-[14%] text-center text-[clamp(58px,12.5vw,180px)] leading-[0.9] font-bold tracking-[-0.05em] select-none">
          TIFFIN GRAB
        </div>
      </div>
    </footer>
  );
}
