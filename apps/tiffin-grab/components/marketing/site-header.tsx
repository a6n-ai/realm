"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, UtensilsCrossedIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@realm/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@realm/commons";

const LINKS = [
  { href: "/menu", label: "Menu" },
  { href: "/#plans", label: "Plans" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  // The client's user type omits `role` (a field the server-side admin plugin adds
  // to the users table); it exists on the wire, just not in this client's inference.
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;

  return (
    <header className="sticky top-0 z-40 relative flex items-center justify-between gap-4 px-4 py-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full">
          <UtensilsCrossedIcon className="size-5" />
        </span>
      </Link>
      <nav className="border-border bg-background/90 absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border p-1 backdrop-blur md:flex">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-4 py-2 text-sm ${pathname === l.href ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {l.label}
          </Link>
        ))}
        <Button asChild size="sm" className="ml-1 rounded-full"><Link href="/subscribe">Start →</Link></Button>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <ModeToggle className="hidden md:inline-flex" />
        {session?.user ? (
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link href={roleLanding(role ?? Role.USER)}>{session.user.name?.split(" ")[0] ?? "Account"}</Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex"><Link href="/login">Sign in</Link></Button>
        )}
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
                {session?.user ? (
                  <Button asChild variant="outline" onClick={() => setOpen(false)}>
                    <Link href={roleLanding(role ?? Role.USER)}>{session.user.name?.split(" ")[0] ?? "Account"}</Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" onClick={() => setOpen(false)}>
                    <Link href="/login">Sign in</Link>
                  </Button>
                )}
                <Button asChild onClick={() => setOpen(false)}>
                  <Link href="/subscribe">Start subscription</Link>
                </Button>
              </div>
            </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
