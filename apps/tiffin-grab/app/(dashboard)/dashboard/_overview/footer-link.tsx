import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

/** Card footer link, pinned to the card bottom so side-by-side cards line up. */
export function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground mt-auto inline-flex w-fit items-center gap-1 pt-2 text-sm transition-colors">
      {children}
      <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  );
}
