import type { ReactNode } from "react";

export function FilterBar({
  search, filters, sort, actions,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {search && <div className="min-w-56 flex-1">{search}</div>}
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {sort}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
