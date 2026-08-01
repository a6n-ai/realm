import { requireStaff } from "@/lib/auth/guards";
import { dailyLabelSheet } from "@/lib/services/daily-labels.service";
import { renderDailyLabelsPdf } from "@/lib/menu/labels-pdf";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Staff-gated: labels carry customer names, addresses, phone numbers, and delivery notes.
export async function GET(request: Request) {
  await requireStaff();

  const date = new URL(request.url).searchParams.get("date");
  if (!date || !ISO_DATE.test(date)) {
    return new Response("A ?date=YYYY-MM-DD is required", { status: 400 });
  }

  const sheet = await dailyLabelSheet(date);
  if (sheet.menuWeekPublicId == null) {
    return new Response(`No menu week released for ${sheet.weekStart}`, { status: 409 });
  }

  const bytes = await renderDailyLabelsPdf(sheet);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="labels-${date}.pdf"`,
      // Names and addresses — never cached by a proxy.
      "Cache-Control": "no-store, private",
    },
  });
}
