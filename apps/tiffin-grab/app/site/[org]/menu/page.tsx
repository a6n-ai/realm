import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "@/components/landing/styles/menu.css";
// Stock photo of dishes on our menu (Pixabay licence), the home page's set, until the kitchen's own shots arrive.
import spreadPhoto from "@/public/landing/stock/dish-spread.jpg";
import { ArrowRight, Download } from "lucide-react";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { PageIntro } from "@/components/landing/public-shell";
import { WeekBoard } from "@/components/landing/week-board";
import { MetaViewContent } from "@/components/meta/meta-view-content";
import { foldPicks, popularSince } from "@/lib/menu/customer-week";
import { buildWeekBoard, dateOf } from "@/lib/landing/week-board";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { siteOrgId } from "@/lib/tenant/site-org";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("This week's menu | Tiffin Grab", "This week's home-style tiffin dishes, day by day: sabzi, dal, rice, roti, raita and salad, plus the weekend dish.", "/menu");
export const revalidate = 300;
export const dynamic = "error";

export default async function MenuPage({ params }: { params: Promise<{ org: string }> }) {
  const organizationId = await siteOrgId((await params).org);
  const [pub, { timezone }] = await Promise.all([menuService.getPublishedWeek(undefined, organizationId), getAppSettings()]);
  const { days, rows, weekend } = pub ? buildWeekBoard(pub, timezone, await menuService.dishPickCounts(popularSince(pub.weekStart)).then(foldPicks)) : { days: [], rows: [], weekend: null };

  const dishNames = [
    ...new Set([
      ...days.flatMap((d) => Object.values(d.dishes).flat()),
      ...(weekend?.dishes ?? []),
    ]),
  ];

  return (
    <div className="lp-wrap lp-section">
      <MetaViewContent contentIds={dishNames.length ? dishNames : ["weekly-menu"]} contentName="Weekly menu" />
      <PageIntro
        eyebrow={pub ? `${dateOf(pub.weekStart, 0)} to ${dateOf(pub.weekStart, 6)}` : "This week"}
        title={<>On the menu this <span className="c-accent">week.</span></>}
        lede="Home-style tiffin, cooked fresh. Subscribers pick from this list for each day."
      />
      <figure className="lp-menu-photo">
        <Image src={spreadPhoto} alt="A spread of home-style Indian dishes: sabzi, dal, rice and roti" placeholder="blur" sizes="(max-width: 767px) 100vw, 1200px" priority />
      </figure>
      {days.length > 0 || weekend ? (
        <>
          <WeekBoard days={days} rows={rows} weekend={weekend} />
          {/* One primary action, then quiet text links (the home page's action pattern). */}
          <div className="lp-actions lp-actions--start mt-10">
            <BuildTiffinLink className="lp-cta">Build my tiffin</BuildTiffinLink>
            <a href="/menu/weekly/pdf" className="lp-textlink">Download PDF<Download aria-hidden className="size-4" strokeWidth={2} /></a>
            <Link href="/pricing" className="lp-textlink">Sizes and rates<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
          </div>
        </>
      ) : (
        <p className="lp-lede">The next menu is on its way. Check back shortly.</p>
      )}
    </div>
  );
}
