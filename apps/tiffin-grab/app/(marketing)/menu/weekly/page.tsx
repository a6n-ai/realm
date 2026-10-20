import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/landing/public-shell";
import { WeekBoard } from "@/components/landing/week-board";
import { buildWeekBoard, dateOf } from "@/lib/landing/week-board";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("This week's menu | Tiffin Grab", "This week's home-style tiffin dishes, day by day: sabzi, dal, rice, roti, raita and salad, plus the weekend dish.", "/menu/weekly");
export const dynamic = "force-dynamic";

export default async function WeeklyMenuPage() {
  const organizationId = await resolveRequestOrg();
  const [pub, { timezone }] = await Promise.all([menuService.getPublishedWeek(undefined, organizationId), getAppSettings()]);
  const { days, rows, weekend } = pub ? buildWeekBoard(pub, timezone) : { days: [], rows: [], weekend: null };

  return (
    <div className="tg-wrap tg-section">
      <PageIntro
        eyebrow={pub ? `${dateOf(pub.weekStart, 0)} to ${dateOf(pub.weekStart, 6)}` : "This week"}
        title={<>On the menu this <span className="c-accent">week.</span></>}
        lede="Home-style tiffin, cooked fresh. Subscribers pick from this list for each day."
      />
      {days.length > 0 || weekend ? (
        <>
          <WeekBoard days={days} rows={rows} weekend={weekend} />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/subscribe" className="tg-cta">Build my tiffin</Link>
            <a href="/menu/weekly/pdf" className="tg-btn">Download PDF</a>
            <Link href="/menu" className="tg-btn">Meal sizes and rates</Link>
          </div>
        </>
      ) : (
        <p className="tg-lede">The next menu is on its way. Check back shortly.</p>
      )}
    </div>
  );
}
