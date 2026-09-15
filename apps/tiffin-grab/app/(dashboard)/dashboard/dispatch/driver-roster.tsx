import { UsersIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import type { DispatchRow, KnownDriver } from "@/lib/services/optimoroute/drivers";

const COLUMNS: readonly Column<"driver" | "serial" | "stops">[] = [
  { key: "driver", label: "Driver" },
  { key: "serial", label: "Serial" },
  { key: "stops", label: "Stops today", align: "right" },
];

export function DriverRoster({ drivers, rows }: { drivers: KnownDriver[]; rows: DispatchRow[] }) {
  const stopCountBySerial = new Map<string, number>();
  for (const r of rows) {
    if (!r.routeDriverSerial) continue;
    stopCountBySerial.set(r.routeDriverSerial, (stopCountBySerial.get(r.routeDriverSerial) ?? 0) + 1);
  }

  return (
    <DataTable
      columns={COLUMNS}
      rows={drivers}
      rowKey={(d) => d.driverSerial}
      serial={false}
      search={{ placeholder: "Search driver…", keys: ["driverName", "driverSerial"] }}
      emptyIcon={UsersIcon}
      emptyMessage="No drivers seen on OptimoRoute routes yet."
      renderRow={(d) => (
        <>
          <TableCell className="font-medium">{d.driverName ?? d.driverSerial}</TableCell>
          <TableCell className="text-muted-foreground text-xs">{d.driverSerial}</TableCell>
          <TableCell className="text-right tabular-nums">
            {stopCountBySerial.get(d.driverSerial) ?? 0}
          </TableCell>
        </>
      )}
    />
  );
}
