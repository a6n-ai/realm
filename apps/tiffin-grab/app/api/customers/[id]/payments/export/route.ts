import { cardBrandLabel } from "@/lib/billing/payment-labels";
import { xlsxResponse } from "@/lib/files/export-response";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { handler } from "@foundry/routes";
import { listPayments } from "@/lib/payments/payments-list.service";
import { methodLabel } from "@/lib/payments/facets";
import { paymentStatusLabel } from "@/lib/payments/status";
import { orders } from "@/db/schema";
import { emailByPublicId, userIdByPublicId } from "@/lib/identity/user-ids";
import { requireStaff } from "@/lib/auth/guards";
import { appTodayIso } from "@/lib/dates/today";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/settings";

const HEADERS = ["Created", "Order", "Type", "Method", "Status", "Amount", "Reference", "Card", "Paid at"];

/** One customer's payments as .xlsx, with the status/method/search filters the Payments tab has open. */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> => {
  await requireStaff();
  const { id } = await params;
  const [userId, email] = await Promise.all([userIdByPublicId(id), emailByPublicId(id)]);
  if (userId == null) throw new NotFoundError("Customer not found");

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const [{ rows }, { timezone }] = await Promise.all([
    listPayments(sp, { where: eq(orders.userId, userId), allTime: true, unpaged: true }),
    getAppSettings(),
  ]);
  const when = (ms: number | null) => (ms ? formatEpoch(ms, { mode: "datetime", timeZone: timezone }) : "");
  const records = rows.map((r) => ({
    Created: when(r.createdAt),
    Order: r.orderPublicId,
    Type: r.isAddon ? "Add-on" : "Plan",
    Method: methodLabel(r.method),
    Status: paymentStatusLabel(r.status),
    Amount: Number(r.amount),
    Reference: r.reference ?? "",
    Card: r.cardLast4 ? `${cardBrandLabel(r.cardBrand)} •••• ${r.cardLast4}` : "",
    "Paid at": when(r.capturedAt),
  }));

  const who = (email ?? id).replace(/[^a-z0-9]+/gi, "-");
  return xlsxResponse(`payments-${who}-${appTodayIso(timezone)}.xlsx`, { name: "Payments", headers: HEADERS, records });
});
