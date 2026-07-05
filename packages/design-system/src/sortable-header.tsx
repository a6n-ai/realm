"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react";
import { TableHead } from "@realm/ui/table";
import { cn } from "@realm/ui/cn";

const alignClass = (align?: "right" | "center") =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : undefined;

export function SortableHeader({ column, label, currentSort, currentDir, align, className }: {
  column: string; label: string; currentSort: string; currentDir: "asc" | "desc";
  align?: "right" | "center"; className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = currentSort === column;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  const onClick = () => {
    const sp = new URLSearchParams(params.toString());
    sp.set("sort", column);
    sp.set("dir", nextDir);
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const Icon = active ? (currentDir === "asc" ? ChevronUpIcon : ChevronDownIcon) : ChevronsUpDownIcon;
  return (
    <TableHead
      className={cn(alignClass(align), className)}
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        // Right-aligned numeric headers push the sort control to the cell edge so
        // the label sits flush over its column.
        className={cn(
          "inline-flex items-center gap-1 min-h-11 sm:min-h-0 hover:text-foreground text-muted-foreground data-[active=true]:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm",
          align === "right" && "flex-row-reverse",
        )}
        data-active={active}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}
