import { parseIsoDate } from "@/lib/dates/iso-date";
import { requireStaff } from "@/lib/auth/guards";
import { dailyLabelSheet } from "@/lib/menu/daily-labels.service";
import { renderDailyLabelsPdf } from "@/lib/menu/labels-pdf";
import { unreleasedWeekMessage } from "@/lib/menu/unreleased-week";

// Staff-gated: labels carry customer names, addresses, phone numbers, and delivery notes.
export async function GET(request: Request) {
  await requireStaff();

  const date = parseIsoDate(new URL(request.url).searchParams.get("date"));
  if (!date) return new Response("A ?date=YYYY-MM-DD is required", { status: 400 });

  const sheet = await dailyLabelSheet(date);
  if (sheet.menuWeekPublicId == null) return new Response(unreleasedWeekMessage(sheet.weekStart), { status: 409 });

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
