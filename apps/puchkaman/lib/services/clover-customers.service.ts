import { ValidationError } from "@realm/commons";
import { cloverCustomers } from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import {
  cloverCustomersSyncService,
  type CloverCustomersPullResult,
} from "@/lib/sync/clover-customers-sync.service";
import { cloverCustomersRepository, type CloverCustomerRow } from "./customers.repository";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

/**
 * Clover customers — SessionUpdatableService over CloverCustomersRepository.
 * Distinct from customers.service.ts (our own app `users` table): this
 * mirrors Clover's own Customer Directory, franchise-scoped like
 * employees/products. Pull sync is SoT; no local create/edit UI in this pass.
 */
class CloverCustomersService extends SessionUpdatableService<typeof cloverCustomers> {
  constructor(protected readonly repo: typeof cloverCustomersRepository) {
    super(repo);
  }

  async listAll(): Promise<CloverCustomerRow[]> {
    return this.repo.findAll().then((rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async pullFromClover(): Promise<CloverCustomersPullResult> {
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(
        "Clover is not connected. Install the plugin under Settings → Integrations, then connect a merchant under Settings → Clover.",
      );
    }
    const result = await cloverCustomersSyncService.pull(client);
    await recordAudit({
      entity: "clover_customers",
      entityPublicId: "bulk",
      operation: "update",
      changes: { _action: "clover_customers_pull", result },
      createdBy: await currentUserId(),
    });
    return result;
  }
}

export const cloverCustomersService = new CloverCustomersService(cloverCustomersRepository);
