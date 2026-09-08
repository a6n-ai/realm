"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";

const LINKS = [
  { href: "/menu/weekly", label: "Menu" },
  { href: "/plans", label: "Plans" },
  { href: "/pricing", label: "Pricing" },
];

// Mobile: logo + auth only — primary navigation is PublicDock (fixed bottom,
// see components/marketing/public-dock.tsx). Desktop (md+, where the dock is
// hidden): the same brand bar grows a brutalist nav row so desktop keeps a
// real navigation surface instead of losing links entirely.
export function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  // The client's user type omits `role` (a field the server-side admin plugin adds
  // to the users table); it exists on the wire, just not in this client's inference.
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 px-4 py-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground border-foreground flex size-9 items-center justify-center rounded-full border-[1.5px]">
          <UtensilsCrossedIcon className="size-5" />
        </span>
      </Link>
      <nav className="border-foreground bg-background hidden items-center gap-1 rounded-full border-[1.5px] p-1 md:flex">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              pathname === l.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <Button
          asChild
          size="sm"
          className="hover-lift ml-1 rounded-full shadow-[0_8px_20px_-6px_var(--color-primary)]"
        >
          <Link href="/subscribe">Start →</Link>
        </Button>
      </nav>
      <div className="flex items-center gap-2">
        <ModeToggle className="hidden md:inline-flex" />
        {session?.user ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={roleLanding(role ?? Role.USER)}>{session.user.name?.split(" ")[0] ?? "Account"}</Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
