import type { KnownDriver } from "@/lib/services/optimoroute/drivers";

/** Read-only reference list — drivers only otherwise appear buried inside the
 *  per-row reassignment dropdown, with no place to just see the roster. */
export function DriverRoster({ drivers }: { drivers: KnownDriver[] }) {
  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No drivers seen on OptimoRoute routes yet.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {drivers.map((d) => (
        <li
          key={d.driverSerial}
          className="bg-muted text-foreground rounded-full px-2.5 py-1 text-xs font-medium"
        >
          {d.driverName ?? d.driverSerial}
        </li>
      ))}
    </ul>
  );
}
