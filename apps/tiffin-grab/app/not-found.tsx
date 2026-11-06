import "@/app/styles/public.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
          {/* One primary way back, then quiet text links (the home page's action pattern). */}
          <div className="lp-actions lp-actions--start">
            <Link href="/" className="lp-cta">Back to home</Link>
            <Link href="/menu" className="lp-textlink">This week&apos;s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
            <Link href="/contact" className="lp-textlink">Contact us<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
          </div>
        </div>
        {/* The home page's tiffin, packed and still steaming, waiting at the wrong address. */}
        <figure className="tg-plate tg-lost__fig tg-lost__fig--steam m-0">
          <span className="tg-plate__corner" data-c="tl">Fig 404</span>
          <span className="tg-plate__corner" data-c="br">Still warm</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- the same first-frame WebP set as the home figure */}
          <img src={FIGURE_RASTER[1]} srcSet={FIGURE_SRCSET} sizes="(max-width: 900px) 90vw, 560px" alt="" width={720} height={640} fetchPriority="high" decoding="async" />
        </figure>
      </div>
    </PublicShell>
  );
}
