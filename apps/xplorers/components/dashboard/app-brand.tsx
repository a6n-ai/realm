import Link from "next/link";
import { SparkleIcon } from "lucide-react";
import { SITE_NAME } from "@/lib/brand";

export function AppBrand({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2">
      <span className="bg-accent text-brand-pink flex size-8 shrink-0 items-center justify-center rounded-md">
        <SparkleIcon className="fill-brand-sunshine size-4" />
      </span>
      <span className="truncate text-sm font-semibold">{SITE_NAME}</span>
    </Link>
  );
}
