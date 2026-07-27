import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { BaseService, columnResolver, conditionToSql } from "@realm/database";
import { orders, payments } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import {
  paymentsRepository,
  type PaymentListRow,
  type PaymentSortColumn,
  type PaymentsRepository,
} from "./payments.repository";

function resolvePaymentFacet(f: FilterCondition) {
  return columnResolver({
    status: payments.status,
    method: payments.method,
    createdAt: payments.createdAt,
    publicId: payments.publicId,
    cloverChargeId: payments.cloverChargeId,
    orderPublicId: orders.publicId,
    customerName: orders.customerName,
    customerEmail: orders.customerEmail,
  })(f);
}

/**
 * Payments service — admin Finance Transactions reads.
 * Writes stay on OrdersService (checkout create/pay).
 */
class PaymentsService extends BaseService<typeof payments> {
  constructor(private readonly paymentsRepo: PaymentsRepository) {
    super(paymentsRepo);
  }

  async listAdmin(page = 0, size = 50): Promise<{ rows: PaymentListRow[]; total: number }> {
    return this.paymentsRepo.listRecent(size, page * size);
  }

  /** Admin list — Condition facets + URL sort + offset pagination. */
  async queryPayments(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<PaymentSortColumn> = { column: "created", dir: "desc" },
  ): Promise<Page<PaymentListRow>> {
    const where = conditionToSql(condition, resolvePaymentFacet);
    return this.paymentsRepo.queryPage(where, sort, page);
  }
}

export const paymentsService = new PaymentsService(paymentsRepository);

export type { PaymentListRow, PaymentSortColumn };
