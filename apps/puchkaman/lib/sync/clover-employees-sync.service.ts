/**
 * Clover employees pull sync.
 * Idempotent upsert by cloverEmployeeId; missing remote rows marked inactive.
 */

import type { CloverApiClient, CloverEmployee } from "@realm/clover";
import {
  employeesRepository,
  type EmployeeRow,
} from "@/lib/services/employees.repository";
import { createMemberUser } from "@/lib/services/create-member-user";
import { usersRepository } from "@/lib/services/users.repository";

export type CloverEmployeesPullResult = {
  upserted: number;
  inactivated: number;
  errors: Array<{ id?: string; message: string }>;
};

export type EmployeeUserDeps = {
  findUserByEmail: (email: string) => Promise<{ id: bigint } | null>;
  createMemberUser: (email: string, name: string) => Promise<bigint>;
};

/**
 * The auth account behind a Clover employee, if one can exist.
 *
 * Employees are keyed on clover_employee_id, users on email — an employee with
 * no email has no key to match or create on, so it simply gets no account. An
 * existing row is linked, never rewritten: a colleague promoted to admin here
 * must not be demoted by the next POS sync.
 */
export async function resolveEmployeeUser(
  emp: { email?: string | null; name: string },
  deps: EmployeeUserDeps,
): Promise<bigint | null> {
  const email = emp.email?.trim().toLowerCase();
  if (!email) return null;
  const existing = await deps.findUserByEmail(email);
  if (existing) return existing.id;
  return deps.createMemberUser(email, emp.name);
}

const liveEmployeeUserDeps: EmployeeUserDeps = {
  findUserByEmail: (email) => usersRepository.findByEmail(email),
  createMemberUser: (email, name) => createMemberUser(email, name),
};

class CloverEmployeesSyncService {
  async pull(client: CloverApiClient): Promise<CloverEmployeesPullResult> {
    const result: CloverEmployeesPullResult = {
      upserted: 0,
      inactivated: 0,
      errors: [],
    };
    const now = Date.now();
    const seen = new Set<string>();

    const remote = await client.listAllEmployees();
    for (const emp of remote) {
      try {
        await this.upsert(emp, now, result);
        seen.add(emp.id);
        result.upserted += 1;
      } catch (err) {
        result.errors.push({
          id: emp.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const local of await employeesRepository.findAll()) {
      if (local.cloverEmployeeId && !seen.has(local.cloverEmployeeId) && local.active) {
        await employeesRepository.updateByInternalId(local.id, { active: false });
        result.inactivated += 1;
      }
    }

    return result;
  }

  private async upsert(
    emp: CloverEmployee,
    now: number,
    result: CloverEmployeesPullResult,
  ): Promise<EmployeeRow> {
    const active = emp.deletedTime == null;
    const existing = await employeesRepository.findByCloverEmployeeId(emp.id);

    const patch: Record<string, unknown> = {
      name: emp.name,
      nickname: emp.nickname ?? null,
      email: emp.email ?? null,
      customId: emp.customId ?? null,
      role: emp.role ?? null,
      isOwner: emp.isOwner === true,
      active,
      cloverEmployeeId: emp.id,
      cloverLastSyncedAt: now,
    };

    // An existing link is never re-resolved (see below), but a dead one must
    // not fail silently: a single by-id lookup — not a table scan — surfaces
    // it in the same admin-visible place as the shared-email conflict, without
    // auto-relinking, minting a replacement, or touching users.status.
    // `inactive` is the state every synced account is born in — it is pending
    // activation, not broken, and the users list already shows it as such.
    if (existing?.userId) {
      const linked = await usersRepository.findStatusById(existing.userId);
      if (!linked || (linked.status !== "active" && linked.status !== "inactive")) {
        result.errors.push({
          id: emp.id,
          message: `Employee "${emp.name}" is linked to an account that is ${linked ? linked.status : "missing"}; sign-in is unavailable until an admin relinks it.`,
        });
      }
    }

    // Resolve a link only when this employee doesn't already have one, and only
    // while they are live on Clover — a deleted employee still comes back from
    // listAllEmployees, and provisioning one would hand an account to someone
    // the merchant has already let go. Leaving an existing link alone means a
    // later email change on Clover's side can never orphan the account it's
    // already tied to, and re-syncing an already linked employee never touches
    // users at all.
    if (active && !existing?.userId) {
      const resolved = await resolveEmployeeUser(
        { email: emp.email, name: emp.name },
        liveEmployeeUserDeps,
      );
      if (resolved !== null) {
        // employees.user_id is UNIQUE. Two Clover employees can share one
        // email (family/shared-terminal logins, a data-entry mistake) — the
        // first to resolve wins the link; the second must still persist its
        // own row, just without one, with the conflict surfaced for an admin
        // to sort out rather than silently failing the whole upsert forever.
        const holder = await employeesRepository.findByUserId(resolved);
        if (holder && holder.id !== existing?.id) {
          result.errors.push({
            id: emp.id,
            message: `Employee "${emp.name}" (${emp.email}) matches an account already linked to another employee; left unlinked.`,
          });
        } else {
          patch.userId = resolved;
        }
      }
    }

    if (existing) {
      return (await employeesRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return employeesRepository.create(patch);
  }
}

export const cloverEmployeesSyncService = new CloverEmployeesSyncService();
