import { createItems, type CreateKind, visibleNav } from "../nav";
import type { Role } from "../../lib/auth/permissions";

export type FindEntry = { id: string; group: "Pages" | "Actions"; label: string; to?: string; create?: CreateKind };

export function findEntries(role: Role): FindEntry[] {
  const pages = visibleNav(role, { total: 0, overdue: 0 }).flatMap((g) =>
    g.items.map((i): FindEntry => ({ id: `page:${i.label}`, group: "Pages", label: i.label, to: i.to })),
  );
  const actions = createItems(role).map((c): FindEntry => ({ id: `new:${c.kind}`, group: "Actions", label: c.label, create: c.kind }));
  return [...pages, ...actions];
}
