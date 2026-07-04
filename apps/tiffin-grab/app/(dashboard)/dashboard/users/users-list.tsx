import type { RoleValue } from "@realm/commons";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableHeader } from "@/components/ds";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortState } from "@/lib/list/sort";
import { UserRow } from "./user-row";

type FlagState = { id: string; key: string; label: string; enabled: boolean };

export type UserListRow = {
  user: { id: string; email: string | null; phone: string | null; role: RoleValue };
  flags: FlagState[];
};

// Single source of truth for the table's columns. The real header and the
// skeleton twin below both render from this, so the loading state can never
// drift from the component.
const COLUMNS = [
  { key: "email", label: "Contact", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "flags", label: "Feature flags" },
] as const;

export function UsersList({
  rows,
  sort,
}: {
  rows: UserListRow[];
  sort: SortState<"email" | "role">;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((c) =>
            "sortable" in c && c.sortable ? (
              <SortableHeader
                key={c.key}
                column={c.key}
                label={c.label}
                currentSort={sort.column}
                currentDir={sort.dir}
              />
            ) : (
              <TableHead key={c.key}>{c.label}</TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <UserRow key={r.user.id} user={r.user} flags={r.flags} />
        ))}
      </TableBody>
    </Table>
  );
}

// Exact loading twin: same COLUMNS + same Table markup, grey cells instead of
// data. Rendered as the page's <Suspense fallback>, so it always matches
// UsersList by construction.
UsersList.Skeleton = function UsersListSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((c) => (
            <TableHead key={c.key}>{c.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 8 }).map((_, r) => (
          <TableRow key={r}>
            {COLUMNS.map((c) => (
              <TableCell key={c.key}>
                {c.key === "flags" ? (
                  <div className="flex flex-wrap gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-24 rounded-full" />
                    ))}
                  </div>
                ) : (
                  <Skeleton className={cn("h-4 w-full", c.key === "role" ? "max-w-32" : "max-w-40")} />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
