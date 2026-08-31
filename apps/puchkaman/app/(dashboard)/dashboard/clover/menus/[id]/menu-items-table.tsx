"use client";

import Link from "next/link";
import { BookOpenIcon } from "lucide-react";
import { DataTable, type Column } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import type { inventoryCatalogService } from "@/lib/services/inventory.service";

type MenuItemRow = Awaited<
  ReturnType<typeof inventoryCatalogService.menus.menuWithItems>
>["items"][number];

export const MENU_ITEM_COLUMNS: readonly Column<"name" | "basePrice" | "price" | "markup" | "status">[] = [
  { key: "name", label: "Item" },
  { key: "basePrice", label: "Register price", align: "right" },
  { key: "price", label: "Menu price", align: "right" },
  { key: "markup", label: "Markup", align: "right" },
  { key: "status", label: "Status" },
];

export function MenuItemsTable({ items }: { items: MenuItemRow[] }) {
  return (
    <DataTable
      columns={MENU_ITEM_COLUMNS}
      rows={items}
      rowKey={(item) => item.publicId}
      serial={false}
      search={{
        keys: ["name"],
        placeholder: "Search items…",
        shortPlaceholder: "Search…",
      }}
      emptyIcon={BookOpenIcon}
      emptyMessage="No items on this menu yet. Run Sync from Clover."
      emptySearchMessage="No items match your search."
      renderRow={(item) => {
        const markup = item.basePrice == null ? null : Number((item.price - item.basePrice).toFixed(2));
        return (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/products/${item.productPublicId}`} className="hover:underline">
                {item.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {item.basePrice == null ? "—" : `$${item.basePrice.toFixed(2)}`}
            </TableCell>
            <TableCell className="text-right tabular-nums">${item.price.toFixed(2)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {markup == null || markup === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                `${markup > 0 ? "+" : ""}$${markup.toFixed(2)}`
              )}
            </TableCell>
            <TableCell>
              <Badge variant={item.enabled ? "default" : "outline"}>
                {item.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </TableCell>
          </>
        );
      }}
    />
  );
}
