import { FilterBar } from "@/components/ds";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";

const COLUMNS = [
  { key: "event", label: "Event" },
  { key: "channels", label: "Channels" },
  { key: "updated", label: "Updated" },
  { key: "actions", label: "Actions", align: "right", width: "w-16" },
] as const;

const FILTER_COUNT = 3;

export function TemplateListSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBar
        search={<Skeleton className="h-9 w-full" />}
        filters={
          <div className="bg-muted/50 inline-flex items-center gap-1 rounded-lg border p-0.5">
            {Array.from({ length: FILTER_COUNT }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-md" />
            ))}
          </div>
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, r) => (
              <TableRow key={r}>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} className={cn("align" in c && "text-right")}>
                    <Skeleton
                      className={cn("h-4", c.key === "actions" ? "w-8" : "w-full max-w-32", "align" in c && "ml-auto")}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
