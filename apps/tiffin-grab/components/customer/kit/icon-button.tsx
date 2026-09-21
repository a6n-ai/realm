import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, FONT, FOCUS } from "./cn";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  "aria-label": string;
  href?: string;
  children: ReactNode;
}

/** 44px round icon control on a muted fill (close, back). With `href` it renders a link. */
export function IconButton({ href, className, children, type = "button", ...rest }: Props) {
  const cls = cn(FONT, FOCUS, "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)] [touch-action:manipulation]", className);
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
    </button>
  );
}

/** 1px hairline rule. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-[var(--border)]", className)} />;
}
