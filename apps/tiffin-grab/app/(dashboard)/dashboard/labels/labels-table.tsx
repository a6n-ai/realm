import { PackageOpenIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import type { KitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";

export function LabelsTable({ sheet }: { sheet: KitchenPackingSheet }) {
  if (sheet.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <PackageOpenIcon className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No tiffin deliveries scheduled for this date</p>
        <p className="text-muted-foreground text-xs">Pick a different date above.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Delivery Date</TableHead>
            <TableHead className="whitespace-nowrap">Customer</TableHead>
            <TableHead className="whitespace-nowrap">Order ID</TableHead>
            <TableHead className="whitespace-nowrap">Plan Name</TableHead>
            <TableHead className="whitespace-nowrap">Meal Size</TableHead>
            {sheet.itemHeaders.map((header) => (
              <TableHead key={header} className="whitespace-nowrap">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sheet.rows.map((row) => (
            <TableRow key={row.deliveryPublicId}>
              <TableCell className="whitespace-nowrap tabular-nums">{row.deliveryDate}</TableCell>
              <TableCell className="whitespace-nowrap">{row.customerName}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs">{row.orderId}</TableCell>
              <TableCell className="whitespace-nowrap">{row.planName}</TableCell>
              <TableCell className="whitespace-nowrap">{row.mealSizeName}</TableCell>
              {sheet.itemHeaders.map((header, i) => (
                <TableCell key={header} className="whitespace-nowrap">
                  {row.items[i] ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
