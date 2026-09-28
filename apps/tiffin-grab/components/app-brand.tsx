import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";

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
      <BrandMark />
      <div className="flex min-w-0 flex-col leading-none">
        <BrandWordmark className="truncate text-base" />
        {subtitle ? (
          <span className="text-muted-foreground mt-0.5 truncate text-[11px] font-medium tracking-wide uppercase">
            {subtitle}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
