import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, PublicShell } from "@/components/landing/public-shell";

export const metadata: Metadata = { title: "Page not found | Tiffin Grab", robots: { index: false } };

export default function NotFound() {
  return (
    <PublicShell>
      <div className="tg-wrap tg-section">
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
    </PublicShell>
  );
}
