import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, PublicShell } from "@/components/landing/public-shell";
import { FIGURE_RASTER, FIGURE_SRCSET } from "@/lib/landing/figure";

export const metadata: Metadata = { title: "Page not found | Tiffin Grab", robots: { index: false } };

export default function NotFound() {
  return (
    <PublicShell>
      <div className="tg-wrap tg-section tg-split tg-lost">
        <div>
          <PageIntro
            eyebrow="404"
            title={<>This tiffin went to the wrong <span className="c-accent">door.</span></>}
            lede="The page you asked for is not here. It may have moved, or the link has a typo."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="tg-cta">Back to home</Link>
            <Link href="/menu/weekly" className="tg-btn">This week&apos;s menu</Link>
            <Link href="/contact" className="tg-btn">Contact us</Link>
          </div>
        </div>
        {/* The home page's tiffin, packed and still steaming, waiting at the wrong address. */}
        <figure className="tg-plate tg-lost__fig m-0">
          <span className="tg-plate__corner" data-c="tl">Fig 404</span>
          <span className="tg-plate__corner" data-c="br">Still warm</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- the same first-frame WebP set as the home figure */}
          <img src={FIGURE_RASTER[1]} srcSet={FIGURE_SRCSET} sizes="(max-width: 900px) 90vw, 560px" alt="" width={720} height={640} loading="lazy" />
        </figure>
      </div>
    </PublicShell>
  );
}
