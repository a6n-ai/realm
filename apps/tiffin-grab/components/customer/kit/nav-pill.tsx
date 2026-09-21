import Link from "next/link";
import { Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { cn, FONT, FOCUS } from "./cn";

/** Top-nav pill: h-11, saffron wash when current. */
export function NavPill({ href, active, children, className }: { href: string; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        FONT,
        FOCUS,
        "inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 [touch-action:manipulation] active:scale-[.97] motion-reduce:transition-none",
        active ? "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Wallet chip: the only entry point to Finances (/me/wallet). Active while on it. */
export function CoinChip({ href, balance, active }: { href: string; balance: number | string; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={`Finances, ${balance} coins`}
      className={cn(
        FONT,
        FOCUS,
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-semibold tabular-nums [touch-action:manipulation] transition-transform duration-100 active:scale-[.97] motion-reduce:active:scale-100",
        active ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]" : "border-[var(--border)] bg-[var(--card)]",
      )}
    >
      <Wallet aria-hidden className="size-4 text-[var(--primary)]" />
      {balance}
    </Link>
  );
}
