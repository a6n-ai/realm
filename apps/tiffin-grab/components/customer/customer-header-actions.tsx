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
      <ModeToggle
        size="lg"
        className={cn(
          "border-white/50 bg-background/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-md",
          "dark:border-white/12 dark:bg-background/30 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        )}
      />
      <TransitionLink
        href="/me/wallet"
        aria-label={`Wallet, ${coinBalance} coins`}
        className={cn(
          "inline-flex h-11 min-w-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tabular-nums",
          "border border-white/50 bg-background/45 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
          "backdrop-blur-md transition-colors hover:bg-background/70",
          "dark:border-white/12 dark:bg-background/30 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        )}
      >
        <WalletIcon className="size-5 text-primary" aria-hidden />
        <span>{coinBalance}</span>
      </TransitionLink>
      <TransitionLink href="/me/account" aria-label="Account" className="rounded-full">
        <Avatar className="size-11 ring-2 ring-background">
          <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} />
          <AvatarFallback className="text-xs">{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
      </TransitionLink>
    </div>
  );
}
