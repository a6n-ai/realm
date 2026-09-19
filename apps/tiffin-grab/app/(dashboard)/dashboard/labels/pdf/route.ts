import { requireStaff } from "@/lib/auth/guards";
import { dailyLabelSheet } from "@/lib/services/daily-labels.service";
import { renderDailyLabelsPdf } from "@/lib/menu/labels-pdf";
import { formatMenuWeekRange } from "@/lib/format/datetime";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function labelsIndexUrl(request: Request, date: string): URL {
  const url = new URL("/dashboard/labels", request.url);
  url.searchParams.set("date", date);
  return url;
}

function unreleasedMessage(weekStart: string): string {
  return `No menu is released for the week of ${formatMenuWeekRange(weekStart)}. Release that week first.`;
}

// Staff-gated: labels carry customer names, addresses, phone numbers, and delivery notes.
export async function GET(request: Request) {
  await requireStaff();

  const date = new URL(request.url).searchParams.get("date");
  if (!date || !ISO_DATE.test(date)) {
    if (request.headers.get("sec-fetch-dest") === "document") {
      return Response.redirect(new URL("/dashboard/labels", request.url), 303);
    }
    return new Response("A ?date=YYYY-MM-DD is required", { status: 400 });
  }

  const sheet = await dailyLabelSheet(date);
  if (sheet.menuWeekPublicId == null) {
    // A browser navigation (the old Print <Link>) must not dump text/plain onto
    // a black page. Send staff back to Daily labels; fetch() callers still get 409.
    if (request.headers.get("sec-fetch-dest") === "document") {
      return Response.redirect(labelsIndexUrl(request, date), 303);
    }
    return new Response(unreleasedMessage(sheet.weekStart), { status: 409 });
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
