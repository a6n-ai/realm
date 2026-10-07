import Image from "next/image";
import Link from "next/link";
import { SITE_NAME } from "@/lib/brand";

/** Public-site logo + wordmark in the customer shell. */
export function CustomerBrand({ href = "/me" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2.5 transition-transform duration-150 ease-out active:scale-[0.98]"
    >
      <Image
        src="/brand/logo-xplorers.png"
        alt=""
        width={140}
        height={62}
        className="h-8 w-auto object-contain md:h-9"
        priority
      />
      <span
        className="truncate text-sm font-bold tracking-tight md:text-base"
        style={{ fontFamily: "var(--font-display)", color: "var(--xl-navy-800, var(--foreground))" }}
      >
        {SITE_NAME}
      </span>
    </Link>
  );
}
