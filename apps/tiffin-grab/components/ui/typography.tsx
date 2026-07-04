import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function TypographyH1({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn("scroll-m-20 text-4xl font-bold tracking-tight text-balance", className)}
      {...props}
    />
  );
}

export function TypographyH2({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0", className)}
      {...props}
    />
  );
}

export function TypographyH3({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("scroll-m-20 text-2xl font-semibold tracking-tight", className)} {...props} />;
}

export function TypographyH4({ className, ...props }: ComponentProps<"h4">) {
  return <h4 className={cn("scroll-m-20 text-xl font-semibold tracking-tight", className)} {...props} />;
}

export function TypographyP({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("leading-7 not-first:mt-6", className)} {...props} />;
}

export function TypographyLead({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-xl", className)} {...props} />;
}

export function TypographyLarge({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-lg font-semibold", className)} {...props} />;
}

export function TypographySmall({ className, ...props }: ComponentProps<"small">) {
  return <small className={cn("text-sm leading-none font-medium", className)} {...props} />;
}

export function TypographyMuted({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export function TypographyBlockquote({ className, ...props }: ComponentProps<"blockquote">) {
  return <blockquote className={cn("mt-6 border-l-2 pl-6 italic", className)} {...props} />;
}

export function TypographyList({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)} {...props} />;
}

export function TypographyInlineCode({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn("bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold", className)}
      {...props}
    />
  );
}
