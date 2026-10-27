import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, FONT, FOCUS } from "./cn";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  "aria-label": string;
  href?: string;
  /** Short hint shown above the button on hover or keyboard focus (touch relies on the label). */
  tip?: string;
  /** No fill: a bare glyph with the same 44px hit area (prev/next arrows). */
  bare?: boolean;
  children: ReactNode;
}

/** Hover / focus hint above an icon control; pure CSS, no portal. */
function Tip({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-[var(--foreground)] px-2.5 py-1 text-[12px] font-medium text-[var(--background)] opacity-0 shadow-md transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {text}
    </span>
  );
}

/** 44px round icon control on a flat fill, no outline (close, back); `bare` drops the fill. With `href` it renders a link. */
export function IconButton({ href, className, children, type = "button", tip, bare, ...rest }: Props) {
  const cls = cn(
    FONT,
    FOCUS,
    "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full [touch-action:manipulation] transition-[background-color,color,transform] duration-150 active:scale-[.96] motion-reduce:transition-none",
    bare
      ? "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      // One fill, not c-surface's wash over a second fill: two stacked translucent layers anti-alias their round
      // edges separately and read as a faint ring on retina screens.
      : "bg-[color-mix(in_oklch,var(--foreground)_14%,transparent)] text-[var(--foreground)] hover:bg-[color-mix(in_oklch,var(--foreground)_19%,transparent)]",
    tip && "group relative",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={rest["aria-label"]} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button {...rest} type={type} className={cls}>
      {children}
      {tip && <Tip text={tip} />}
    </button>
  );
}

/** 1px hairline rule. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-[var(--border)]", className)} />;
}
