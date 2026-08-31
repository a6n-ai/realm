import { Fragment } from "react";
import { PackageOpenIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import type { PackingLabelRow } from "@/lib/services/labels.service";
import { LABEL_COLUMNS } from "./label-columns";

export function LabelsTable({ rows }: { rows: PackingLabelRow[] }) {
  if (rows.length === 0) {
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
            {LABEL_COLUMNS.map((c, i) => (
              <TableHead key={i} className="whitespace-nowrap">{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.deliveryPublicId}>
              <TableCell className="whitespace-nowrap">{row.customerPhone}</TableCell>
              <TableCell className="whitespace-nowrap">{row.firstName}</TableCell>
              <TableCell className="whitespace-nowrap">{row.planName}</TableCell>
              {Array.from({ length: 7 }, (_, i) => row.items[i]).map((item, i) => (
                <Fragment key={i}>
                  <TableCell className="whitespace-nowrap">{item?.name ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{item?.qty ?? ""}</TableCell>
                </Fragment>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
