/**
 * Clover Employees API types + normalizers.
 *
 * Platform paths (sandbox `apisandbox.dev.clover.com`, prod `api.clover.com`):
 * - GET/POST  /v3/merchants/{mId}/employees
 * - GET/POST  /v3/merchants/{mId}/employees/{empId}  (POST = update)
 * - DELETE    /v3/merchants/{mId}/employees/{empId}
 *
 * Permissions (Developer Dashboard → App Settings → Requested Permissions):
 * - Read employees  — list/get; also required to see who created/owns an order
 * - Write employees — create/update/delete (not required for pull-only sync)
 *
 * Orders: Platform orders expose `employee: { id }` (who created/owns the order).
 * Assign via POST …/orders/{orderId} with `{ employee: { id } }`, or pass
 * `employeeId` on atomic order create when supported.
 */

export type CloverEmployeeRole = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";

/** Employee as returned by Platform API `/employees`. */
export type CloverEmployee = {
  id: string;
  /** Display name (Clover primary name field). */
  name: string;
  nickname?: string | null;
  /** Merchant-defined custom id. */
  customId?: string | null;
  email?: string | null;
  /** OWNER | ADMIN | MANAGER | EMPLOYEE */
  role?: CloverEmployeeRole | string;
  isOwner?: boolean;
  inviteSent?: boolean;
  claimedTime?: number | null;
  /** Soft-delete marker; present when deleted. */
  deletedTime?: number | null;
  modifiedTime?: number;
};

export type CloverEmployeeCreateInput = {
  name: string;
  nickname?: string | null;
  customId?: string | null;
  email?: string | null;
  role?: CloverEmployeeRole;
  /** PIN is accepted on create; never returned by subsequent GETs. */
  pin?: string;
};

export type CloverEmployeeUpdateInput = Partial<CloverEmployeeCreateInput> & {
  id?: string;
};

export type ListEmployeesParams = {
  limit?: number;
  offset?: number;
  /** Comma-separated expansions, e.g. `roles,shifts`. */
  expand?: string;
  /**
   * Filter expression. Deleted employees are excluded by default —
   * use `deletedTime>0` (or similar) to include them.
   */
  filter?: string;
};

function optString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "string" ? v : undefined;
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function optNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function optNullableNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return optNumber(v) ?? undefined;
}

/** Prefer `name`; fall back to firstName + lastName when present. */
function resolveEmployeeName(o: Record<string, unknown>): string {
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  const first = typeof o.firstName === "string" ? o.firstName.trim() : "";
  const last = typeof o.lastName === "string" ? o.lastName.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined;
}

/** Normalize a raw Platform API employee (throws if id/name missing). */
export function normalizeCloverEmployee(raw: unknown): CloverEmployee {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover employee payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = resolveEmployeeName(o);
  if (!id || !name) throw new Error("Clover employee missing id or name");

  return {
    id,
    name,
    nickname: optString(o.nickname),
    customId: optString(o.customId),
    email: optString(o.email),
    role: typeof o.role === "string" ? o.role : undefined,
    isOwner: optBool(o.isOwner),
    inviteSent: optBool(o.inviteSent),
    claimedTime: optNullableNumber(o.claimedTime),
    deletedTime: optNullableNumber(o.deletedTime),
    modifiedTime: optNumber(o.modifiedTime),
  };
}
