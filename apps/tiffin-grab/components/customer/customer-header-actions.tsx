"use client";

import { WalletIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Avatar, AvatarFallback, AvatarImage } from "@realm/ui/avatar";
import { ModeToggle } from "@/components/mode-toggle";
import { TransitionLink } from "@/components/motion/transition-link";

function initials(name: string | null, email: string): string {
  return (name?.trim() || email).slice(0, 2).toUpperCase();
}

export function CustomerHeaderActions({
  user,
  coinBalance,
}: {
  user: { name: string | null; email: string; image: string | null };
  coinBalance: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <ModeToggle />
      <TransitionLink
        href="/me/wallet"
        aria-label={`Wallet, ${coinBalance} coins`}
        className={cn(
          "inline-flex h-9 min-w-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium tabular-nums",
          "text-foreground transition-colors hover:bg-accent",
        )}
      >
        <WalletIcon className="size-4 text-primary" aria-hidden />
        <span>{coinBalance}</span>
      </TransitionLink>
      <TransitionLink href="/me/account" aria-label="Account" className="rounded-full">
        <Avatar className="size-9 ring-2 ring-background">
          <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} />
          <AvatarFallback className="text-xs">{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
      </TransitionLink>
    </div>
  );
}
