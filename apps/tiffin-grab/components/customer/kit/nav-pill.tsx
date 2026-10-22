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
        "relative inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 [touch-action:manipulation] active:scale-[.97] [@media(hover:hover)]:hover:-translate-y-px motion-reduce:transition-none motion-reduce:transform-none",
        // The bar under the current item is a cue that doesn't rely on colour alone.
        active
          ? "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] after:absolute after:bottom-1.5 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-current dark:text-[#FFB877]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Wallet chip: the only entry point to Finances (/me/wallet). Active while on it. */
export function CoinChip({ href, balance, value, active }: { href: string; balance: number | string; /** Money value of the coins; null/absent = no coin rate, coins only. */ value?: number | null; active?: boolean }) {
  const money = value == null ? null : `$${value.toFixed(2)}`;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={`Finances, ${balance} coins${money ? `, worth ${money}` : ""}`}
      className={cn(
        FONT,
        FOCUS,
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-semibold tabular-nums [touch-action:manipulation] transition-[background-color,border-color,transform] duration-150 hover:border-[var(--primary)] active:scale-[.97] [@media(hover:hover)]:hover:-translate-y-px motion-reduce:transform-none",
        active ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]",
      )}
    >
      <Wallet aria-hidden className="size-5 text-[var(--primary)]" />
      {balance}
      {money ? <span className="hidden text-[13px] font-medium text-[var(--muted-foreground)] sm:inline">{money}</span> : null}
    </Link>
  );
}
