import { eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { handler } from "@foundry/routes";
import { listPayments } from "@/lib/services/payments-list.service";
import { methodLabel } from "@/lib/payments/facets";
import { paymentStatusLabel } from "@/lib/payments/status";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { appTodayIso } from "@/lib/dates/today";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";

const HEADERS = ["Created", "Order", "Type", "Method", "Status", "Amount", "Reference", "Card", "Paid at"];

/** One customer's payments as .xlsx, with the status/method/search filters the Payments tab has open. */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> => {
  await requireStaff();
  const { id } = await params;
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.publicId, id)).limit(1);
  if (!user) throw new NotFoundError("Customer not found");

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const [{ rows }, { timezone }] = await Promise.all([
    listPayments(sp, { where: eq(orders.userId, user.id), allTime: true, unpaged: true }),
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
    Card: r.cardLast4 ? `${r.cardBrand ?? "Card"} •••• ${r.cardLast4}` : "",
    "Paid at": when(r.capturedAt),
  }));

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(records, { header: HEADERS }), "Payments");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const who = (user.email ?? id).replace(/[^a-z0-9]+/gi, "-");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payments-${who}-${appTodayIso(timezone)}.xlsx"`,
    },
  });
});
