import Link from "next/link";

const ZONES = "Etobicoke · Mississauga · Brampton · Toronto · Scarborough · Markham · Richmond Hill · North York · Vaughan · Oakville · East York";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <div className="text-foreground font-semibold">Tiffin Grab</div>
          <p className="mt-2">Customizable home-style tiffin delivery across the GTA.</p>
        </div>
        <div>
          <div className="text-foreground font-medium">Explore</div>
          <ul className="mt-2 space-y-1">
            <li><Link href="/how-it-works" className="hover:text-foreground">How it works</Link></li>
            <li><Link href="/menu" className="hover:text-foreground">Menu</Link></li>
            <li><Link href="/pricing" className="hover:text-foreground">Pricing</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-foreground font-medium">Areas served</div>
          <p className="mt-2">{ZONES}</p>
        </div>
      </div>
      <div className="text-muted-foreground border-t py-4 text-center text-xs">
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
