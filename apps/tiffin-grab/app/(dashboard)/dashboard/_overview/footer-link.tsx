import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

export function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground mt-4 inline-flex items-center gap-1 text-sm transition-colors">
      {children}
      <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  );
}
