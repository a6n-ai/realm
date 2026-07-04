import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ListRow({
  avatar, title, meta, trailing, href,
}: {
  avatar?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}) {
  const inner = (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors", href && "hover:bg-accent")}>
      <div className="flex items-center gap-3">
        {avatar && <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg text-xs font-semibold">{avatar}</span>}
        <div>
          <div className="font-medium">{title}</div>
          {meta && <div className="text-muted-foreground text-xs">{meta}</div>}
        </div>
      </div>
      {trailing && <div className="flex items-center gap-2">{trailing}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
