import { chipState, type AccessRow, type ChipOp } from "@foundry/crm";

export type RoleChoice = { value: string; label: string; locked?: boolean };

/** Mirrors the server guards so chips explain a refusal before the click; the server still decides. */
export function chipReasons(rows: Pick<AccessRow, "roles" | "email">[], options: RoleChoice[], selfEmail: string | null) {
  const owners = rows.filter((r) => r.roles.includes("owner")).length;
  const aboveViewer = options.filter((o) => o.locked).map((o) => o.value);
  return (row: Pick<AccessRow, "roles" | "email">, role: string, op: ChipOp) =>
    chipState(role, op, {
      self: selfEmail !== null && row.email === selfEmail,
      roleCount: row.roles.length,
      targetAboveViewer: row.roles.some((r) => aboveViewer.includes(r)),
      lastOwnerRole: owners <= 1 ? "owner" : undefined,
      aboveViewer,
    });
}
