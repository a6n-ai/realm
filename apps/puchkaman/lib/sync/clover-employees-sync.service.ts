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
        await this.upsert(emp, now);
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

  private async upsert(emp: CloverEmployee, now: number): Promise<EmployeeRow> {
    const active = emp.deletedTime == null;
    const userId = await resolveEmployeeUser(
      { email: emp.email, name: emp.name },
      liveEmployeeUserDeps,
    );
    const patch = {
      name: emp.name,
      nickname: emp.nickname ?? null,
      email: emp.email ?? null,
      customId: emp.customId ?? null,
      role: emp.role ?? null,
      isOwner: emp.isOwner === true,
      active,
      cloverEmployeeId: emp.id,
      cloverLastSyncedAt: now,
      userId,
    };
    const existing = await employeesRepository.findByCloverEmployeeId(emp.id);
    if (existing) {
      return (await employeesRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return employeesRepository.create(patch);
  }
}

export const cloverEmployeesSyncService = new CloverEmployeesSyncService();
