/**
 * Clover customers pull sync.
 * Idempotent upsert by cloverCustomerId. No inactivate pass — unlike products/
 * employees/menu entities, Clover's customer directory carries no `deleted`
 * flag on list/get, so there's nothing here to distinguish "still active" from
 * "gone" — a removed customer's row just stops getting touched on future pulls.
 */

import type { CloverApiClient, CloverCustomer } from "@foundry/clover";
import { resolveActingOrgId } from "@/lib/services/integrations.service";
import {
  cloverCustomersRepository,
  type CloverCustomerRow,
} from "@/lib/services/customers.repository";

export type CloverCustomersPullResult = {
  upserted: number;
  errors: Array<{ id?: string; message: string }>;
};

class CloverCustomersSyncService {
  async pull(client: CloverApiClient): Promise<CloverCustomersPullResult> {
    const result: CloverCustomersPullResult = { upserted: 0, errors: [] };
    const now = Date.now();
    const orgId = await resolveActingOrgId();

    const remote = await client.listAllCustomers();
    for (const cust of remote) {
      try {
        await this.upsert(cust, now, orgId);
        result.upserted += 1;
      } catch (err) {
        result.errors.push({
          id: cust.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  private async upsert(
    cust: CloverCustomer,
    now: number,
    orgId: string | null,
  ): Promise<CloverCustomerRow> {
    const existing = await cloverCustomersRepository.findByCloverCustomerId(cust.id);

    const patch: Record<string, unknown> = {
      name: cust.name,
      firstName: cust.firstName ?? null,
      lastName: cust.lastName ?? null,
      email: cust.email ?? null,
      phone: cust.phone ?? null,
      marketingAllowed: cust.marketingAllowed === true,
      customerSince: cust.customerSince ?? null,
      cloverCustomerId: cust.id,
      cloverLastSyncedAt: now,
      organizationId: orgId,
    };

    if (existing) {
      return (await cloverCustomersRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return cloverCustomersRepository.create(patch);
  }
}

export const cloverCustomersSyncService = new CloverCustomersSyncService();
