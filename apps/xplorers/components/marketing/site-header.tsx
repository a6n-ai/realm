"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompassIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { useSession } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import { SITE_NAME } from "@/lib/brand";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/programs", label: "Programs" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;

  return (
    <header className="bg-background/80 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full">
          <CompassIcon className="size-5" />
        </span>
        <span>{SITE_NAME}</span>
      </Link>
      <nav className="order-last flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1 md:justify-center">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors md:px-4 ${
              pathname === l.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <ModeToggle />
        {session?.user ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={landingPathFor(role ?? Role.USER)}>{session.user.name?.split(" ")[0] ?? "Account"}</Link>
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
