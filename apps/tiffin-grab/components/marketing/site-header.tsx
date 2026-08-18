"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, UtensilsCrossedIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@realm/ui/sheet";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/menu", label: "Menu" },
  { href: "/menu/weekly", label: "Weekly Menu" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <UtensilsCrossedIcon className="size-5" />
          </span>
          Tiffin Grab
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm ${pathname === l.href ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm" className="hidden md:inline-flex"><Link href="/subscribe">Start subscription</Link></Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-md px-2 py-2.5 text-sm ${pathname === l.href ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 flex flex-col gap-2 px-4">
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild onClick={() => setOpen(false)}>
                  <Link href="/subscribe">Start subscription</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
