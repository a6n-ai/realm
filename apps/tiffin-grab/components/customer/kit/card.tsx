import type { HTMLAttributes } from "react";
import { cn, FONT, FOCUS, SPRING } from "./cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
}

export function Card({ interactive, selected, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      {...(interactive ? { role: rest.role ?? "button", tabIndex: rest.tabIndex ?? 0, "aria-pressed": selected } : {})}
      className={cn(
        FONT,
        "c-surface rounded-3xl border border-transparent bg-card text-foreground",
        interactive && cn(FOCUS, "cursor-pointer transition-transform duration-150 active:scale-[.985] motion-reduce:transition-none", SPRING),
        selected && "ring-[1.5px] ring-primary bg-primary/10",
        className,
      )}
    />
  );
}
