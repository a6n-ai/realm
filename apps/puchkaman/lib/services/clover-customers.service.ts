import { NotFoundError, ValidationError } from "@realm/commons";
import { cloverCustomers } from "@/db/schema";
import { db } from "@/db/client";
import { createCloverClient } from "@/lib/clover/client";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { SITE_URL } from "@/lib/seo";
import {
  cloverCustomersSyncService,
  type CloverCustomersPullResult,
} from "@/lib/sync/clover-customers-sync.service";
import { cloverCustomersRepository, type CloverCustomerListRow as RepoListRow } from "./customers.repository";
import { usersRepository } from "./users.repository";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

export type CloverCustomerListRow = RepoListRow & { hasAccount: boolean };

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

  /** hasAccount = an app `users` row shares this customer's email — cross-referenced in one batch query, not per row. */
  async listAll(): Promise<CloverCustomerListRow[]> {
    const rows = await this.repo.findAll();
    const emails = [...new Set(rows.map((r) => r.email).filter((e): e is string => !!e))];
    const accountEmails = await usersRepository.findEmailsIn(emails);
    return rows
      .map((r) => ({ ...r, hasAccount: !!r.email && accountEmails.has(r.email) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Emails a Clover customer with no app account a link to order online.
   * Doesn't provision an account — the customer signs up themselves (email
   * OTP) the same way any other visitor does; this is just the nudge.
   */
  async inviteToOrder(publicId: string): Promise<void> {
    const row = await this.repo.findByPublicId(publicId);
    if (!row) throw new NotFoundError(`Customer not found: ${publicId}`);
    if (!row.email) throw new ValidationError("This customer has no email on file.");
    const existing = await usersRepository.findByEmail(row.email);
    if (existing) throw new ValidationError("This customer already has an account.");

    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        event: "clover_customer_invite",
        kind: "marketing",
        recipientEmail: row.email!,
        title: "Order online at Puchkaman",
        body: `Hi ${row.name}, you can now order online — pickup or delivery, saved right to your account.`,
        href: SITE_URL,
        data: { customer: { name: row.name } },
        dedupeKey: `clover_customer_invite:${row.publicId}`,
      });
    });

    await recordAudit({
      entity: "clover_customers",
      entityPublicId: publicId,
      operation: "update",
      changes: { _action: "invite_to_order" },
      createdBy: await currentUserId(),
    });
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
