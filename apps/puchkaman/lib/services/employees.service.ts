import { ValidationError } from "@realm/commons";
import { UpdatableService } from "@realm/database";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, users } from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import { getSession } from "@/lib/auth/session";
import {
  cloverEmployeesSyncService,
  type CloverEmployeesPullResult,
} from "@/lib/sync/clover-employees-sync.service";
import {
  employeesRepository,
  type EmployeeRow,
} from "./employees.repository";

async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await getSession();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Clover employees — UpdatableService over EmployeesRepository.
 * Pull sync is SoT; local edits are not pushed in this pass.
 */
class EmployeesService extends UpdatableService<typeof employees> {
  constructor(protected readonly repo: typeof employeesRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
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
    return cloverEmployeesSyncService.pull(client);
  }
}

export const employeesService = new EmployeesService(employeesRepository);
