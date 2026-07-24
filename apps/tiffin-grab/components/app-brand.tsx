import Link from "next/link";
import { UtensilsCrossedIcon } from "lucide-react";

/** Compact header brand for mobile when the sidebar (and its trigger) are hidden. */
export function AppBrand({
  href,
  subtitle,
}: {
  href: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 max-w-full items-center gap-2.5"
      aria-label="TiffinGrab home"
    >
      <div className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm">
        <UtensilsCrossedIcon className="size-5" />
      </div>
      <div className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-base font-bold tracking-tight">TiffinGrab</span>
        {subtitle ? (
          <span className="text-muted-foreground mt-0.5 truncate text-[11px] font-medium tracking-wide uppercase">
            {subtitle}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
