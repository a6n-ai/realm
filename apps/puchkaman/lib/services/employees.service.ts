import { ValidationError } from "@realm/commons";
import { employees } from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import {
  cloverEmployeesSyncService,
  type CloverEmployeesPullResult,
} from "@/lib/sync/clover-employees-sync.service";
import {
  employeesRepository,
  type EmployeeRow,
} from "./employees.repository";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

/**
 * Clover employees — SessionUpdatableService over EmployeesRepository.
 * Pull sync is SoT; local edits are not pushed in this pass.
 */
class EmployeesService extends SessionUpdatableService<typeof employees> {
  constructor(protected readonly repo: typeof employeesRepository) {
    super(repo);
  }

  async listAll(): Promise<EmployeeRow[]> {
    return this.repo.findAll().then((rows) =>
      [...rows].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    );
  }

  /** Active employees for order assignment picker. */
  async listAssignable(): Promise<EmployeeRow[]> {
    return this.repo.findActive().then((rows) =>
      [...rows]
        .filter((r) => !!r.cloverEmployeeId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async pullFromClover(): Promise<CloverEmployeesPullResult> {
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(
        "Clover is not connected. Install the plugin under Settings → Integrations, then connect a merchant under Settings → Clover.",
      );
    }
    const result = await cloverEmployeesSyncService.pull(client);
    await recordAudit({
      entity: "employees",
      entityPublicId: "bulk",
      operation: "update",
      changes: { _action: "clover_employees_pull", result },
      createdBy: await currentUserId(),
    });
    return result;
  }
}

export const employeesService = new EmployeesService(employeesRepository);
