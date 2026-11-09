import { foldPicks, popularSince } from "@/lib/menu/customer-week";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { menuBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

// The brand's published week, as /menu shows it.
export async function GET() {
  const [pub, { timezone }] = await Promise.all([menuService.getPublishedWeek(undefined, null), getAppSettings()]);
  const board = pub ? buildWeekBoard(pub, timezone, await menuService.dishPickCounts(popularSince(pub.weekStart)).then(foldPicks)) : { days: [], rows: [], weekend: null };
  return publicJson(menuBody(pub?.weekStart ?? null, board, publicOrigin()));
}
