import { SITE_PITCH } from "@/lib/brand";
import { TapeLabel, XplButton } from "@/components/marketing/xpl-ui";

export function HomeHero() {
  return (
    <header className="xpl-hero relative flex flex-col gap-8 overflow-hidden border-b border-[var(--rule)] px-5 pt-8 pb-12 lg:h-[836px] lg:justify-between lg:gap-0 lg:py-12 lg:pr-0 lg:pl-20">
      <p className="xpl-mono text-[11px] lg:text-xs">
        <span className="lg:hidden">01 / A maker studio in Singapore</span>
        <span className="hidden lg:inline">01 / A maker studio in Singapore · Open to everyone</span>
      </p>
      <h1 className="xpl-disp xpl-hero-title flex flex-col whitespace-nowrap">
        <span>Make.</span>
        <span className="xpl-hero-explore">Explore.</span>
        <span className="text-[var(--blueprint)]">Connect.</span>
      </h1>
      <div
        className="xpl-obj pointer-events-none right-4 top-16 h-16 w-24 -rotate-8 lg:top-[86px] lg:left-[640px] lg:right-auto lg:h-[110px] lg:w-[170px]"
        role="img"
        aria-label="Placeholder: a pair of scissors, cut-out photo"
      >
        <span className="lg:hidden">[ scissors ]</span>
        <span className="hidden lg:inline">
          [ Cut-out —
          <br />
          scissors ]
        </span>
      </div>
      <div
        className="xpl-obj pointer-events-none top-44 left-3.5 h-[84px] w-14 rotate-4 lg:top-[300px] lg:left-24 lg:h-[170px] lg:w-[120px]"
        role="img"
        aria-label="Placeholder: a beaker with blue liquid, cut-out photo"
      >
        <span className="lg:hidden">[ beaker ]</span>
        <span className="hidden lg:inline">
          [ Cut-out —
          <br />
          beaker ]
        </span>
      </div>
      <div
        className="xpl-obj pointer-events-none top-[268px] right-10 size-14 -rotate-3 rounded-full bg-[var(--blush)] lg:top-[520px] lg:left-[820px] lg:right-auto lg:size-[90px]"
        role="img"
        aria-label="Placeholder: a half-eaten biscuit, cut-out photo"
      >
        <span className="text-[8px] tracking-[0.08em] lg:hidden">[ biscuit ]</span>
        <span className="hidden text-[9px] tracking-[0.1em] lg:inline">
          [ Half a
          <br />
          biscuit ]
        </span>
      </div>
      <div
        className="xpl-obj pointer-events-none hidden rotate-6 lg:top-[290px] lg:left-[1130px] lg:flex lg:h-[140px] lg:w-[210px]"
        role="img"
        aria-label="Placeholder: a wooden keychain and sandpaper, cut-out photo"
      >
        [ Cut-out — keychain
        <br />+ sandpaper ]
      </div>
      <p className="xpl-hand pointer-events-none absolute top-[300px] right-[104px] -rotate-3 whitespace-nowrap text-xl lg:top-[500px] lg:right-auto lg:left-[930px] lg:flex lg:flex-col lg:items-start lg:text-[26px] lg:-rotate-2">
        <span className="lg:hidden">someone left this here →</span>
        <span className="hidden lg:inline">someone left this here</span>
        <svg
          width="60"
          height="40"
          viewBox="0 0 60 40"
          aria-hidden="true"
          className="-mt-1.5 -ml-10 hidden scale-x-[-1] lg:block"
        >
          <path d="M4 3 C 14 10, 30 22, 52 36" stroke="#1B3A6B" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path
            d="M40 34 L53 37 L50 24"
            stroke="#1B3A6B"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </p>
      <TapeLabel className="hidden lg:top-[150px] lg:left-[1010px] lg:block lg:-rotate-2">
        Wed 7pm · adults · 2 spots
      </TapeLabel>
      <p className="m-0 max-w-[300px] text-lg leading-[1.5] text-pretty lg:hidden">{SITE_PITCH}</p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:pr-20">
        <p className="m-0 hidden max-w-[420px] text-[22px] leading-[1.5] text-pretty lg:block">{SITE_PITCH}</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <XplButton href="/whats-on" className="h-[52px] lg:h-auto">
            See what&apos;s on
          </XplButton>
          <XplButton href="/contact" variant="outline" className="h-[52px] lg:hidden">
            Book an experience
          </XplButton>
          <XplButton href="/contact" variant="text" className="hidden lg:inline-flex">
            Book an experience
          </XplButton>
        </div>
      </div>
    </header>
  );
}
