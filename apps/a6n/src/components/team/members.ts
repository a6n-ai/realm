import type { Facet } from "@foundry/console/filters";
import type { MemberRow } from "../../lib/team/service";

export type MemberStatus = "active" | "invited" | "removed";

export const memberStatus = (m: Pick<MemberRow, "status" | "passwordSet">): MemberStatus =>
  m.status !== "active" ? "removed" : m.passwordSet ? "active" : "invited";

export const MEMBER_FACETS: Facet[] = [
  { key: "role", label: "Role", options: [{ value: "admin", label: "Admin" }, { value: "sales", label: "Sales" }] },
  { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "invited", label: "Invited" }, { value: "removed", label: "Removed" }] },
];

export type MemberSearch = { q?: string; role?: string; status?: string };

export function filterMembers<T extends Pick<MemberRow, "name" | "email" | "role" | "status" | "passwordSet">>(members: T[], f: MemberSearch): T[] {
  const needle = f.q?.trim().toLowerCase();
  return members.filter(
    (m) =>
      (!f.role || m.role === f.role) &&
      (!f.status || memberStatus(m) === f.status) &&
      (!needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle)),
  );
}
