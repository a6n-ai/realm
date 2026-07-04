import { renderWeeklyMenuPdf } from "@/lib/menu/pdf";

export async function GET() {
  try {
    const bytes = await renderWeeklyMenuPdf("tiffin");
    return new Response(bytes as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tiffin-weekly-menu.pdf"' },
    });
  } catch {
    return new Response("No menu published", { status: 404 });
  }
}
