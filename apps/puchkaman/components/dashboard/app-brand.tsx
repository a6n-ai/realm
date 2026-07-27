import Link from "next/link";
import { UtensilsCrossedIcon } from "lucide-react";

export function AppBrand({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2">
      <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
        <UtensilsCrossedIcon className="size-4" />
      </span>
      <span className="truncate text-sm font-semibold">Puchkaman</span>
    </Link>
  );
}
