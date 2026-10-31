"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/reui/badge";

/** Shown when an analytics drill dated the list by payment capture; removing it restores the default created-date basis. */
export function DatedByChip() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (params.get("basis") !== "money") return null;
  return (
    <Badge variant="secondary" className="gap-1.5">
      Dated by payment date
      <button
        type="button"
        aria-label="Remove payment date basis"
        className="hover:text-foreground -mr-1 inline-flex transition-colors"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.delete("basis");
          next.delete("page");
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        <XIcon aria-hidden />
      </button>
    </Badge>
  );
}
