import { createItems, type CreateKind, visibleNav } from "../nav";
import type { Permission } from "../../lib/auth/permissions";

export type FindEntry = { id: string; group: "Pages" | "Actions"; label: string; to?: string; create?: CreateKind };

export function findEntries(permissions: readonly Permission[]): FindEntry[] {
  const pages = visibleNav(permissions, { total: 0, overdue: 0 }).flatMap((g) =>
    g.items.map((i): FindEntry => ({ id: `page:${i.label}`, group: "Pages", label: i.label, to: i.to })),
  );
  pages.push({ id: "page:Account settings", group: "Pages", label: "Account settings", to: "/settings/account" });
  const actions = createItems(permissions).map((c): FindEntry => ({ id: `new:${c.kind}`, group: "Actions", label: c.label, create: c.kind }));
  return [...pages, ...actions];
}
