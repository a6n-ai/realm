"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { Button } from "@realm/ui/button";

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
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
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
          <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/subscribe">Start subscription</Link></Button>
        </div>
      </div>
    </header>
  );
}
