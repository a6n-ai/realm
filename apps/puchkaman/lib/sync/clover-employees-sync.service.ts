/**
 * Clover employees pull sync.
 * Idempotent upsert by cloverEmployeeId; missing remote rows marked inactive.
 */

import type { CloverApiClient, CloverEmployee } from "@realm/clover";
import {
  employeesRepository,
  type EmployeeRow,
} from "@/lib/services/employees.repository";

export type CloverEmployeesPullResult = {
  upserted: number;
  inactivated: number;
  errors: Array<{ id?: string; message: string }>;
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
    };
    const existing = await employeesRepository.findByCloverEmployeeId(emp.id);
    if (existing) {
      return (await employeesRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return employeesRepository.create(patch);
  }
}

export const cloverEmployeesSyncService = new CloverEmployeesSyncService();
