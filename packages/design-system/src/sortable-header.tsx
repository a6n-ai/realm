"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react";
import { TableHead } from "@realm/ui/table";

export function SortableHeader({ column, label, currentSort, currentDir, className }: {
  column: string; label: string; currentSort: string; currentDir: "asc" | "desc"; className?: string;
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
    <TableHead className={className}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground data-[active=true]:text-foreground" data-active={active}>
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}
