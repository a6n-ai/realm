import { and as cAnd, eq as cEq } from "@foundry/commons/model/condition";
import { parseFilterState, type FacetDef } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { formatAppWhen } from "@/lib/app-clock";
import { parseSort } from "@/lib/list/sort";
import { getAppClock } from "@/lib/services/app-settings.service";
import { paymentsService } from "@/lib/services/payments.service";
import { PAYMENT_SORT_COLUMNS } from "./payment-facets";
import { PaymentsTable } from "./payments-table";

export type SearchParams = Promise<Record<string, string | undefined>>;

/** Server half of both payment tabs; `status` pins the Pending tab to one status. */
export async function PaymentsData({
  spec,
  searchParams,
  status,
  emptyMessage,
}: {
  spec: FacetDef[];
  searchParams: SearchParams;
  status?: string;
  emptyMessage: string;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const sort = parseSort(sp, PAYMENT_SORT_COLUMNS, { column: "time", dir: "desc" });
  const { condition, page } = parseFilterState(spec, sp);
  const pinned = status ? (condition ? cAnd(cEq("status", status), condition) : cEq("status", status)) : condition;
  const [{ timezone }, result] = await Promise.all([getAppClock(), paymentsService.listPage(pinned, page, sort)]);

  return (
    <PaymentsTable
      spec={spec}
      rows={result.items.map((r) => ({ ...r, whenLabel: formatAppWhen(r.createdAt, timezone) }))}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      canReview
      emptyMessage={emptyMessage}
    />
  );
}
