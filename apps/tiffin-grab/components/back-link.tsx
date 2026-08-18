import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

/** Mobile-only "back to parent section" link shown above a PageHeader. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="md:hidden">
      <Link
        href={href}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        {label}
      </Link>
    </div>
  );
}
