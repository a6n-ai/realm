import Link from "next/link";
import { NAV } from "@/lib/marketing/content";

export function SiteFooter() {
  return (
    <footer className="flex flex-col gap-6 border-t-2 border-[var(--blush)] bg-[var(--blueprint)] px-5 pt-10 pb-[100px] text-[15px] leading-[1.7] text-white lg:gap-14 lg:px-20 lg:pt-16 lg:pb-10">
      <div className="grid gap-6 lg:grid-cols-[4fr_2fr_2fr_2fr_2fr] lg:gap-6">
        <div className="flex flex-col gap-3">
          <div className="xpl-disp text-2xl tracking-[-0.02em] lg:text-[28px]">Xplorers</div>
          <div className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-[var(--blush)] uppercase lg:text-xs">
            Make. Explore. Connect.
          </div>
          <p className="mt-3 hidden opacity-85 lg:block">
            A maker studio in Singapore. Indoor and outdoor.
            <br />
            Getting here → nearest MRT, parking, step-free entry.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:contents">
          <div className="flex flex-col gap-1">
            <span className="mb-2 hidden font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-[var(--blush)] uppercase lg:block">
              Explore
            </span>
            {NAV.filter((l) => l.href !== "/the-place").map((item) => (
              <Link key={item.href} href={item.href} className="text-white">
                {item.label === "Schools" ? (
                  <>
                    <span className="lg:hidden">Schools</span>
                    <span className="hidden lg:inline">Schools &amp; Companies</span>
                  </>
                ) : (
                  item.label
                )}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="mb-2 hidden font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-[var(--blush)] uppercase lg:block">
              Studio
            </span>
            <Link href="/the-place" className="text-white hover:text-[var(--blush)]">
              The Place
            </Link>
            <Link href="/membership" className="text-white hover:text-[var(--blush)]">
              Membership
            </Link>
            <Link href="/community" className="hidden text-white hover:text-[var(--blush)] lg:inline">
              Community
            </Link>
            <Link href="/faq" className="hidden text-white hover:text-[var(--blush)] lg:inline">
              FAQ
            </Link>
            <a href="mailto:hello@xplorers.life" className="text-white hover:text-[var(--blush)] lg:hidden">
              hello@xplorers.life
            </a>
            <span className="lg:hidden">
              <a href="https://wa.me/" className="text-white hover:text-[var(--blush)]">
                WhatsApp · Instagram
              </a>
            </span>
            <Link href="/the-place" className="text-white hover:text-[var(--blush)] lg:hidden">
              Getting here
            </Link>
          </div>
        </div>
        <div className="hidden flex-col gap-1 lg:flex">
          <span className="mb-2 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-[var(--blush)] uppercase">
            Say hello
          </span>
          <a href="mailto:hello@xplorers.life" className="text-white hover:text-[var(--blush)]">
            hello@xplorers.life
          </a>
          <a href="https://wa.me/" className="text-white hover:text-[var(--blush)]">
            WhatsApp
          </a>
          <a href="https://instagram.com/" className="text-white hover:text-[var(--blush)]">
            Instagram
          </a>
          <a href="https://facebook.com/" className="text-white hover:text-[var(--blush)]">
            Facebook
          </a>
        </div>
        <div className="flex items-center gap-4 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.1em] uppercase opacity-80 lg:flex-col lg:items-start lg:gap-3 lg:text-[11px] lg:opacity-85">
          <span className="hidden text-[11px] tracking-[0.14em] text-[var(--blush)] lg:block">We accept</span>
          <span className="rounded border border-white/40 px-3 py-2 font-bold tracking-[0.1em]">PayNow</span>
          <span className="leading-[1.7]">
            NLB LearningX
            <span className="hidden lg:inline">
              <br />
              Community partner
            </span>
            <span className="lg:hidden"> partner</span>
          </span>
        </div>
      </div>
      <div className="flex gap-4 border-t border-white/15 pt-5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.1em] uppercase opacity-70 lg:gap-6 lg:text-[11px] lg:opacity-75">
        <span>© 2026 Xplorers</span>
        <Link href="/privacy" className="text-white">
          Privacy
        </Link>
        <Link href="/cancellation" className="text-white">
          <span className="lg:hidden">Cancellation</span>
          <span className="hidden lg:inline">Cancellation policy</span>
        </Link>
      </div>
    </footer>
  );
}

export function BookBar() {
  return (
    <div className="xpl-bookbar fixed right-0 bottom-0 left-0 z-40 flex min-h-[72px] items-center gap-3 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--bone)_94%,transparent)] px-5 lg:hidden">
      <span className="xpl-mono flex-1 text-[10px] leading-[1.5] tracking-[0.12em]">
        Next session
        <br />
        <span className="text-[var(--ink)]">Today 2pm · 4 spots left</span>
      </span>
      <Link
        href="/contact"
        className="xpl-btn h-12 rounded-full px-[22px] py-0 text-xs"
      >
        Book <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
